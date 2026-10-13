// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractIntent } from "../adapters/ai";
import { travelEstimates } from "../adapters/maps";
import { DEFAULT_WEIGHTS } from "../config/constants";
import { canTransition, isCancellable, isTerminal, nextDriverStep, TRANSITIONS } from "../domain/bookingStateMachine";
import { availabilityTier, facilityTier } from "../domain/confidence";
import { REQUIRED_CAPABILITIES } from "../domain/capabilityMap";
import { explain, isEligible, scoreCandidate, type Candidate } from "../domain/ranking";

const now = new Date("2026-10-13T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("booking state machine", () => {
  it("allows the happy path only in order", () => {
    expect(canTransition("Requested", "Searching", "system")).toBe(true);
    expect(canTransition("Searching", "Accepted", "dispatcher")).toBe(true);
    expect(canTransition("Accepted", "Assigned", "dispatcher")).toBe(true);
    expect(canTransition("Assigned", "EnRoute", "driver")).toBe(true);
    expect(canTransition("EnRoute", "Arrived", "driver")).toBe(true);
    expect(canTransition("Arrived", "Completed", "driver")).toBe(true);
    expect(canTransition("Requested", "Accepted", "dispatcher")).toBe(false);
    expect(canTransition("Searching", "Completed", "driver")).toBe(false);
  });

  it("restricts who may trigger each step", () => {
    expect(canTransition("Searching", "Accepted", "patient")).toBe(false);
    expect(canTransition("Assigned", "EnRoute", "patient")).toBe(false);
    expect(canTransition("Searching", "TimedOut", "dispatcher")).toBe(false);
  });

  it("treats terminal states as final and stops cancellation at Arrived", () => {
    for (const s of ["Completed", "Cancelled", "Rejected", "TimedOut", "Failed"] as const) {
      expect(isTerminal(s)).toBe(true);
      expect(Object.keys(TRANSITIONS[s])).toHaveLength(0);
    }
    expect(isCancellable("Assigned")).toBe(true);
    expect(isCancellable("EnRoute")).toBe(false);
    expect(isCancellable("Arrived")).toBe(false);
  });

  it("gives drivers exactly one next step", () => {
    expect(nextDriverStep("Assigned")).toBe("EnRoute");
    expect(nextDriverStep("EnRoute")).toBe("Arrived");
    expect(nextDriverStep("Arrived")).toBe("Completed");
    expect(nextDriverStep("Completed")).toBeNull();
  });
});

describe("confidence tiers", () => {
  it("downgrades stale availability to reported and empty to unknown", () => {
    expect(availabilityTier(ago(10 * 60_000), 60, now)).toBe("confirmed");
    expect(availabilityTier(ago(9 * 3600_000), 60, now)).toBe("reported");
    expect(availabilityTier(null, 60, now)).toBe("unknown");
  });

  it("downgrades facilities verified outside the window", () => {
    expect(facilityTier({ present: true, confirmed: true, lastVerifiedAt: ago(10 * 86_400_000) }, 90, now)).toBe("confirmed");
    expect(facilityTier({ present: true, confirmed: true, lastVerifiedAt: ago(120 * 86_400_000) }, 90, now)).toBe("reported");
    expect(facilityTier({ present: true, confirmed: false, lastVerifiedAt: ago(1000) }, 90, now)).toBe("reported");
    expect(facilityTier({ present: true, confirmed: false, lastVerifiedAt: null }, 90, now)).toBe("unknown");
    expect(facilityTier({ present: false, confirmed: false, lastVerifiedAt: null }, 90, now)).toBeNull();
  });
});

const cand = (over: Partial<Candidate>): Candidate => ({
  hospitalId: "h", distanceKm: 3, etaMinutes: 10,
  capabilityTiers: { ct_scan: "confirmed", stroke_unit: "confirmed" },
  availability: { icuBeds: 2, emergencyBeds: 3, ventilators: 1, tier: "confirmed", freshness: 1 },
  specialistsOnDuty: [], emergency24x7: true, ratingAverage: 3, ...over,
});

describe("ranking", () => {
  it("excludes a hospital missing a required capability even with a perfect rating", () => {
    const required = REQUIRED_CAPABILITIES.stroke;
    const famous = cand({ capabilityTiers: { ct_scan: "confirmed" }, ratingAverage: 5 });
    expect(isEligible(famous, required)).toBe(false);
    expect(isEligible(cand({ capabilityTiers: { ct_scan: "confirmed", stroke_unit: "unknown" } }), required)).toBe(false);
    expect(isEligible(cand({ capabilityTiers: { ct_scan: "reported", stroke_unit: "confirmed" } }), required)).toBe(true);
  });

  it("scores nearer and fresher hospitals higher", () => {
    const ctx = { category: "stroke" as const, required: REQUIRED_CAPABILITIES.stroke, preferred: [], radiusKm: 15, maxEta: 30 };
    const near = scoreCandidate(cand({ distanceKm: 2, etaMinutes: 6 }), ctx, DEFAULT_WEIGHTS);
    const far = scoreCandidate(cand({ distanceKm: 12, etaMinutes: 28 }), ctx, DEFAULT_WEIGHTS);
    const stale = scoreCandidate(cand({ distanceKm: 2, etaMinutes: 6, availability: { icuBeds: 2, emergencyBeds: 3, ventilators: 1, tier: "reported", freshness: 0 } }), ctx, DEFAULT_WEIGHTS);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(stale);
  });

  it("explains results from stored facts and flags unconfirmed items", () => {
    const { matchedBecause, unconfirmed } = explain(
      cand({ capabilityTiers: { ct_scan: "confirmed", stroke_unit: "reported" }, availability: { icuBeds: 2, emergencyBeds: 1, ventilators: 0, tier: "reported", freshness: 0.4 } }),
      { category: "stroke", required: REQUIRED_CAPABILITIES.stroke, closestId: "h" },
    );
    expect(matchedBecause).toContainEqual({ code: "has_capability", capability: "ct_scan", tier: "confirmed" });
    expect(unconfirmed).toContainEqual({ code: "capability_not_recent", capability: "stroke_unit" });
    expect(unconfirmed).toContainEqual({ code: "availability_stale" });
  });
});

describe("AI intent fallback", () => {
  it("falls back to rule-based matching when the model returns invalid JSON", async () => {
    const { intent, degraded } = await extractIntent("stroke", "face drooping, slurred speech", { ai: async () => { throw new Error("invalid_output"); } });
    expect(degraded).toBe(true);
    expect(intent.source).toBe("rule");
    expect(intent.requiredCapabilities).toEqual(REQUIRED_CAPABILITIES.stroke);
  });

  it("lets AI add preferences but never remove required capabilities", async () => {
    const { intent, degraded } = await extractIntent("stroke", "fell and hit head", { ai: async () => ["mri"] });
    expect(degraded).toBe(false);
    expect(intent.source).toBe("ai");
    expect(intent.requiredCapabilities).toEqual(REQUIRED_CAPABILITIES.stroke);
    expect(intent.preferredCapabilities).toContain("mri");
  });

  it("does not call AI or flag degradation when there is no text", async () => {
    const { intent, degraded } = await extractIntent("cardiac", undefined, { ai: async () => { throw new Error("should not run"); } });
    expect(degraded).toBe(false);
    expect(intent.source).toBe("rule");
  });
});

describe("routing fallback", () => {
  it("uses straight-line estimates and flags degraded when routing fails", async () => {
    const { estimates, degraded } = await travelEstimates({ lat: 28.47, lng: 77.5 }, [{ id: "a", lat: 28.5, lng: 77.52 }], {
      route: async () => { throw new Error("routes_503"); },
    });
    expect(degraded).toBe(true);
    expect(estimates.get("a")).toMatchObject({ source: "straight_line" });
    expect(estimates.get("a")!.etaMinutes).toBeGreaterThan(0);
  });
});
