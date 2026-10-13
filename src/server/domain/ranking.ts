import type { Capability, Category, Reason, Tier, Weights } from "@/lib/schemas";
import { CATEGORY_SPECIALTIES } from "./capabilityMap";

export interface Candidate {
  hospitalId: string;
  distanceKm: number;
  etaMinutes: number | null;
  capabilityTiers: Partial<Record<Capability, Tier | null>>;
  availability: {
    icuBeds: number | null;
    emergencyBeds: number | null;
    ventilators: number | null;
    tier: Tier;
    freshness: number; // 0..1
  };
  specialistsOnDuty: string[];
  emergency24x7: boolean;
  ratingAverage: number | null;
}

/** Eligible only if every required capability is Confirmed or Reported. Ratings play no part. */
export function isEligible(c: Pick<Candidate, "capabilityTiers">, required: Capability[]): boolean {
  return required.every((cap) => {
    const t = c.capabilityTiers[cap];
    return t === "confirmed" || t === "reported";
  });
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Normalises each factor to 0..1 and applies the admin weights. */
export function scoreCandidate(
  c: Candidate,
  ctx: { category: Category; required: Capability[]; preferred: Capability[]; radiusKm: number; maxEta: number },
  w: Weights,
) {
  const travel = c.etaMinutes === null ? 0.5 : clamp01(1 - c.etaMinutes / Math.max(ctx.maxEta, 1));
  const distance = clamp01(1 - c.distanceKm / ctx.radiusKm);
  const beds =
    ctx.category === "breathing" ? c.availability.ventilators : ctx.category === "other" ? c.availability.emergencyBeds : c.availability.icuBeds;
  const availability = beds === null ? 0.25 : beds > 0 ? (c.availability.tier === "confirmed" ? 1 : 0.7) : 0;
  const freshness = c.availability.freshness;
  const wanted = CATEGORY_SPECIALTIES[ctx.category];
  const specialistHit = wanted.length && c.specialistsOnDuty.some((s) => wanted.includes(s)) ? 1 : 0;
  const preferredHit = ctx.preferred.length
    ? ctx.preferred.filter((p) => c.capabilityTiers[p] === "confirmed" || c.capabilityTiers[p] === "reported").length / ctx.preferred.length
    : 0;
  const specialist = clamp01(specialistHit * 0.7 + preferredHit * 0.3 + (wanted.length ? 0 : 0.5));
  const rating = c.ratingAverage === null ? 0.5 : clamp01((c.ratingAverage - 1) / 4);

  const confirmedShare = ctx.required.filter((r) => c.capabilityTiers[r] === "confirmed").length / Math.max(ctx.required.length, 1);
  const score =
    w.travel * travel +
    w.distance * distance +
    w.availability * availability +
    w.freshness * freshness +
    w.specialist * specialist +
    w.rating * rating;
  // Small tie-breaker favouring confirmed over reported capabilities.
  return Math.round((score * 0.95 + confirmedShare * 0.05) * 1000) / 1000;
}

/** Explanation items built from stored facts only. */
export function explain(c: Candidate, ctx: { category: Category; required: Capability[]; closestId: string | null }) {
  const matchedBecause: Reason[] = [];
  const unconfirmed: Reason[] = [];
  for (const cap of ctx.required) {
    const tier = c.capabilityTiers[cap];
    if (tier === "confirmed" || tier === "reported") matchedBecause.push({ code: "has_capability", capability: cap, tier });
    if (tier === "reported") unconfirmed.push({ code: "capability_not_recent", capability: cap });
  }
  const kind = ctx.category === "breathing" ? "ventilator" : ctx.category === "other" ? "emergency" : "icu";
  const count = kind === "ventilator" ? c.availability.ventilators : kind === "emergency" ? c.availability.emergencyBeds : c.availability.icuBeds;
  if (count !== null && count > 0) matchedBecause.push({ code: "beds_available", kind, count, tier: c.availability.tier });
  if (c.availability.tier === "reported") unconfirmed.push({ code: "availability_stale" });
  if (c.availability.tier === "unknown") unconfirmed.push({ code: "availability_unknown" });
  const wanted = CATEGORY_SPECIALTIES[ctx.category];
  if (wanted.length && c.specialistsOnDuty.some((s) => wanted.includes(s))) matchedBecause.push({ code: "specialist_on_duty" });
  if (c.emergency24x7) matchedBecause.push({ code: "open_24x7" });
  if (ctx.closestId === c.hospitalId) matchedBecause.push({ code: "closest", distanceKm: c.distanceKm });
  return { matchedBecause, unconfirmed };
}
