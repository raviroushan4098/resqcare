import type { SearchRequest, SearchResponse, SearchResult } from "@/lib/schemas";
import { SearchRequestSchema } from "@/lib/schemas";
import { extractIntent } from "../adapters/ai";
import { travelEstimates } from "../adapters/maps";
import { SEARCH_LOG_TTL_MS } from "../config/constants";
import { freshnessScore } from "../domain/confidence";
import { haversineKm } from "../domain/geo";
import { explain, isEligible, scoreCandidate, type Candidate } from "../domain/ranking";
import type { Ctx } from "../http/router";
import { C, type SearchLogDoc, type SpecialistDoc } from "../repositories/collections";
import { getConfig } from "./configService";
import { availabilityView, facilityViews, loadBundles, loadHospitals } from "./hospitalService";

/**
 * Emergency search pipeline (Part D.12):
 * intent -> geohash radius query -> capability gate -> travel estimates for the top 5 ->
 * weighted score -> fact-only explanations -> search log (no free text).
 */
export async function emergencySearch(ctx: Ctx, input: SearchRequest): Promise<SearchResponse> {
  const started = Date.now();
  const req = SearchRequestSchema.parse(input);
  const cfg = await getConfig(ctx.store, ctx.scenario);
  const radiusKm = Math.min(req.radiusKm, cfg.search.maxRadiusKm);
  const origin = { lat: req.lat, lng: req.lng };

  try {
    const { intent, degraded: aiDegraded } = await extractIntent(req.category, req.text, { forceFail: ctx.scenario === "ai-down" });
    if (aiDegraded) ctx.degraded.add("ai");

    const docs = await loadHospitals(ctx.store, { ...origin, radiusKm });
    const bundles = await loadBundles(ctx.store, docs);
    const specialists = docs.length
      ? await ctx.store.query<SpecialistDoc>(C.specialists, { where: [["onDuty", "==", true]] })
      : [];
    const onDutyBy = new Map<string, string[]>();
    for (const s of specialists) if (s.confirmed) onDutyBy.set(s.hospitalId, [...(onDutyBy.get(s.hospitalId) ?? []), s.specialty]);

    // Eligibility gate: approved hospital + every required capability Confirmed or Reported.
    const candidates: (Candidate & { name: string; phone: string; lat: number; lng: number; views: ReturnType<typeof facilityViews>; av: ReturnType<typeof availabilityView> })[] = [];
    for (const b of bundles) {
      if (b.hospital.verificationStatus !== "approved") continue;
      const views = facilityViews(b, cfg, ctx.now);
      const tiers = Object.fromEntries(views.map((v) => [v.capability, v.tier]));
      if (ctx.scenario === "no-match" || !isEligible({ capabilityTiers: tiers }, intent.requiredCapabilities)) continue;
      const av = availabilityView(b, cfg, ctx.now);
      candidates.push({
        hospitalId: b.hospital.id,
        name: b.hospital.name,
        phone: b.hospital.phones[0] ?? "",
        lat: b.hospital.location.lat,
        lng: b.hospital.location.lng,
        distanceKm: haversineKm(origin, b.hospital.location),
        etaMinutes: null,
        capabilityTiers: tiers,
        availability: {
          icuBeds: av.icuBeds,
          emergencyBeds: av.emergencyBeds,
          ventilators: av.ventilators,
          tier: av.tier,
          freshness: freshnessScore(av.updatedAt, cfg.freshness.availabilityMinutes, ctx.now),
        },
        specialistsOnDuty: onDutyBy.get(b.hospital.id) ?? [],
        emergency24x7: b.hospital.emergency24x7,
        ratingAverage: b.hospital.ratingAverage,
        views,
        av,
      });
    }

    // Nearest 10 eligible; routed travel estimates for the top 5.
    candidates.sort((a, b) => a.distanceKm - b.distanceKm);
    const top = candidates.slice(0, 10);
    const { estimates, degraded: mapsDegraded } = await travelEstimates(
      origin,
      top.map((c) => ({ id: c.hospitalId, lat: c.lat, lng: c.lng })),
      { forceFail: ctx.scenario === "maps-down" },
    );
    if (mapsDegraded) ctx.degraded.add("maps");
    for (const c of top) {
      const e = estimates.get(c.hospitalId)!;
      c.distanceKm = e.distanceKm;
      c.etaMinutes = e.etaMinutes;
    }

    const maxEta = Math.max(...top.map((c) => c.etaMinutes ?? 0), 1);
    const scored = top
      .map((c) => ({ c, score: scoreCandidate(c, { category: req.category, required: intent.requiredCapabilities, preferred: intent.preferredCapabilities, radiusKm, maxEta }, cfg.weights) }))
      .sort((a, b) => b.score - a.score || a.c.distanceKm - b.c.distanceKm);
    const closestId = [...top].sort((a, b) => a.distanceKm - b.distanceKm)[0]?.hospitalId ?? null;

    const results: SearchResult[] = scored.map(({ c, score }, i) => {
      const { matchedBecause, unconfirmed } = explain(c, { category: req.category, required: intent.requiredCapabilities, closestId });
      return {
        hospitalId: c.hospitalId,
        name: c.name,
        rank: i + 1,
        score,
        verification: "approved",
        distanceKm: Math.round(c.distanceKm * 10) / 10,
        etaMinutes: c.etaMinutes,
        etaIsEstimate: true,
        facilities: c.views.filter((v) => intent.requiredCapabilities.includes(v.capability) || intent.preferredCapabilities.includes(v.capability) || v.capability === "emergency_24x7"),
        availability: { icuBeds: c.av.icuBeds, emergencyBeds: c.av.emergencyBeds, ventilators: c.av.ventilators, tier: c.av.tier, updatedAt: c.av.updatedAt },
        matchedBecause,
        unconfirmed,
        phone: c.phone,
        lat: c.lat,
        lng: c.lng,
      };
    });

    // Nearest hospitals to phone when nothing passes the gate.
    const nearest = results.length
      ? []
      : bundles
          .filter((b) => b.hospital.verificationStatus === "approved")
          .map((b) => ({ hospitalId: b.hospital.id, name: b.hospital.name, phone: b.hospital.phones[0] ?? "", distanceKm: Math.round(haversineKm(origin, b.hospital.location) * 10) / 10 }))
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, 5);

    await logSearch(ctx, { category: req.category, latencyMs: Date.now() - started, resultCount: results.length, noConfidentMatch: results.length === 0, aiSource: intent.source, outcome: "ok", errorCause: null });
    return {
      intent: { category: intent.category, requiredCapabilities: intent.requiredCapabilities, preferredCapabilities: intent.preferredCapabilities, source: intent.source },
      results,
      noConfidentMatch: results.length === 0,
      nearest,
    };
  } catch (e) {
    await logSearch(ctx, { category: req.category, latencyMs: Date.now() - started, resultCount: 0, noConfidentMatch: false, aiSource: "rule", outcome: "error", errorCause: "internal" });
    throw e;
  }
}

async function logSearch(ctx: Ctx, l: Omit<SearchLogDoc, "id" | "createdAt" | "expiresAt" | "degraded" | "city">) {
  const id = ctx.store.newId("sl_");
  await ctx.store.set(C.searchLogs, id, {
    ...l,
    id,
    degraded: [...ctx.degraded],
    city: "Greater Noida",
    createdAt: ctx.now.toISOString(),
    expiresAt: new Date(ctx.now.getTime() + SEARCH_LOG_TTL_MS).toISOString(),
  } satisfies SearchLogDoc);
}
