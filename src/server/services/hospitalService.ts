import type { AvailabilityView, FacilityView, FlagInput, HospitalDetail, HospitalSummary, Tier } from "@/lib/schemas";
import { CACHE_TTL } from "../config/constants";
import type { DocStore } from "../db/store";
import { availabilityTier, facilityTier } from "../domain/confidence";
import { haversineKm, queryBounds } from "../domain/geo";
import { notFound } from "../errors/AppError";
import type { Ctx } from "../http/router";
import {
  C,
  type AvailabilityDoc,
  type DepartmentDoc,
  type FacilityDoc,
  type FlagDoc,
  type HospitalDoc,
  type SpecialistDoc,
} from "../repositories/collections";
import type { FullConfig } from "./configService";

/** Hospitals that may appear anywhere public. Rejected and suspended never do. */
const PUBLIC_STATES = ["approved", "pending", "unverified"] as const;

type Bundle = { hospital: HospitalDoc; facilities: FacilityDoc[]; availability: AvailabilityDoc | null };

// Static hospital data cached 60 s (Part C.6). Availability is always read fresh.
const cache = ((globalThis as unknown as { __rqHospCache?: Map<string, { at: number; v: unknown }> }).__rqHospCache ??= new Map());
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL.hospitalStaticMs) return hit.v as T;
  const v = await load();
  cache.set(key, { at: Date.now(), v });
  return v;
}
export const invalidateHospitalCache = () => cache.clear();

async function inChunks<T>(store: DocStore, path: string, field: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    out.push(...(await store.query<T>(path, { where: [[field, "in", ids.slice(i, i + 30)]] })));
  }
  return out;
}

/** All public hospitals, or only those within a radius (geohash range queries + haversine refine). */
export async function loadHospitals(store: DocStore, near?: { lat: number; lng: number; radiusKm: number }): Promise<HospitalDoc[]> {
  if (!near) {
    return cached(`all:${store.kind}`, () =>
      store.query<HospitalDoc>(C.hospitals, { where: [["verificationStatus", "in", [...PUBLIC_STATES]]] }),
    );
  }
  const bounds = queryBounds(near.lat, near.lng, near.radiusKm);
  const found = await Promise.all(
    bounds.map(([start, end]) =>
      cached(`gh:${store.kind}:${start}:${end}`, () =>
        store.query<HospitalDoc>(C.hospitals, {
          where: [
            ["location.geohash", ">=", start],
            ["location.geohash", "<=", end],
          ],
          orderBy: [["location.geohash", "asc"]],
        }),
      ),
    ),
  );
  const byId = new Map(found.flat().map((h) => [h.id, h]));
  return [...byId.values()].filter(
    (h) => (PUBLIC_STATES as readonly string[]).includes(h.verificationStatus) && haversineKm(near, h.location) <= near.radiusKm,
  );
}

export async function loadBundles(store: DocStore, hospitals: HospitalDoc[]): Promise<Bundle[]> {
  const ids = hospitals.map((h) => h.id);
  const [facilities, availability] = await Promise.all([
    cached(`fac:${store.kind}:${ids.join(",")}`, () => inChunks<FacilityDoc>(store, C.facilities, "hospitalId", ids)),
    inChunks<AvailabilityDoc>(store, C.availability, "hospitalId", ids),
  ]);
  const facBy = new Map<string, FacilityDoc[]>();
  for (const f of facilities) facBy.set(f.hospitalId, [...(facBy.get(f.hospitalId) ?? []), f]);
  const avBy = new Map(availability.map((a) => [a.hospitalId, a]));
  return hospitals.map((h) => ({ hospital: h, facilities: facBy.get(h.id) ?? [], availability: avBy.get(h.id) ?? null }));
}

export function facilityViews(b: Bundle, cfg: FullConfig, now: Date): FacilityView[] {
  return b.facilities
    .map((f) => {
      let tier = facilityTier(f, cfg.freshness.facilityDays, now);
      // Unverified hospitals can never show a Confirmed fact.
      if (tier === "confirmed" && b.hospital.verificationStatus !== "approved") tier = "reported";
      return tier ? { capability: f.capability, tier, verifiedAt: f.lastVerifiedAt } : null;
    })
    .filter((x): x is FacilityView => x !== null);
}

const UNKNOWN_AVAILABILITY: AvailabilityView = {
  icuBeds: null, icuTotal: null, emergencyBeds: null, emergencyTotal: null, ventilators: null, ventilatorsTotal: null,
  servicesNow: null, tier: "unknown", updatedAt: null, source: null,
};

/** Unverified hospitals never make availability claims. Stale data is "reported", never "confirmed". */
export function availabilityView(b: Bundle, cfg: FullConfig, now: Date): AvailabilityView {
  const a = b.availability;
  if (!a || !a.reportedAt || b.hospital.verificationStatus !== "approved") return UNKNOWN_AVAILABILITY;
  const tier: Tier = availabilityTier(a.reportedAt, cfg.freshness.availabilityMinutes, now);
  return {
    icuBeds: a.icuBeds?.available ?? null,
    icuTotal: a.icuBeds?.total ?? null,
    emergencyBeds: a.emergencyBeds?.available ?? null,
    emergencyTotal: a.emergencyBeds?.total ?? null,
    ventilators: a.ventilators?.available ?? null,
    ventilatorsTotal: a.ventilators?.total ?? null,
    servicesNow: a.servicesNow,
    tier,
    updatedAt: a.reportedAt,
    source: a.source,
  };
}

export function toSummary(b: Bundle, cfg: FullConfig, now: Date, origin?: { lat: number; lng: number } | null): HospitalSummary {
  const h = b.hospital;
  return {
    id: h.id,
    name: h.name,
    verification: h.verificationStatus,
    verifiedAt: h.verifiedAt,
    address: h.address,
    city: h.city,
    lat: h.location.lat,
    lng: h.location.lng,
    phone: h.phones[0] ?? "",
    emergency24x7: h.emergency24x7,
    specialties: h.specialties,
    facilities: facilityViews(b, cfg, now),
    availability: availabilityView(b, cfg, now),
    distanceKm: origin ? Math.round(haversineKm(origin, h.location) * 10) / 10 : null,
    isFictional: h.isFictional,
  };
}

export interface ListFilters {
  q?: string;
  city?: string;
  specialty?: string;
  emergency24x7?: boolean;
  verifiedOnly?: boolean;
  confidence?: Tier;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  cursor?: string;
  limit?: number;
}

export async function listHospitals(ctx: Ctx, cfg: FullConfig, f: ListFilters) {
  const origin = f.lat !== undefined && f.lng !== undefined ? { lat: f.lat, lng: f.lng } : null;
  const docs = await loadHospitals(ctx.store, origin && f.radiusKm ? { ...origin, radiusKm: f.radiusKm } : undefined);
  const bundles = await loadBundles(ctx.store, docs);
  let items = bundles.map((b) => toSummary(b, cfg, ctx.now, origin));
  const q = (f.q ?? f.city ?? "").trim().toLowerCase();
  if (q) items = items.filter((h) => `${h.name} ${h.address} ${h.city}`.toLowerCase().includes(q));
  if (f.specialty) items = items.filter((h) => h.specialties.includes(f.specialty!));
  if (f.emergency24x7) items = items.filter((h) => h.emergency24x7);
  if (f.verifiedOnly) items = items.filter((h) => h.verification === "approved");
  if (f.confidence) items = items.filter((h) => h.availability.tier === f.confidence);
  items.sort((a, b) => (origin ? (a.distanceKm ?? 0) - (b.distanceKm ?? 0) : a.name.localeCompare(b.name)));
  const limit = Math.min(f.limit ?? 20, 50);
  const offset = f.cursor ? Math.max(0, parseInt(f.cursor, 10) || 0) : 0;
  const page = items.slice(offset, offset + limit);
  ctx.meta.nextCursor = offset + limit < items.length ? String(offset + limit) : null;
  return { items: page, total: items.length };
}

export async function getHospitalBundle(store: DocStore, id: string): Promise<Bundle> {
  const h = await store.get<HospitalDoc>(C.hospitals, id);
  if (!h || !(PUBLIC_STATES as readonly string[]).includes(h.verificationStatus)) throw notFound("Hospital");
  const [b] = await loadBundles(store, [h]);
  return b!;
}

export async function getHospitalDetail(ctx: Ctx, cfg: FullConfig, id: string, origin: { lat: number; lng: number } | null): Promise<HospitalDetail> {
  const b = await getHospitalBundle(ctx.store, id);
  const approved = b.hospital.verificationStatus === "approved";
  const [departments, specialists] = await Promise.all([
    ctx.store.query<DepartmentDoc>(C.departments, { where: [["hospitalId", "==", id]] }),
    ctx.store.query<SpecialistDoc>(C.specialists, { where: [["hospitalId", "==", id]] }),
  ]);
  return {
    ...toSummary(b, cfg, ctx.now, origin),
    operatingHours: b.hospital.operatingHours,
    emergencyHours: b.hospital.emergencyHours,
    // Only confirmed departments and specialists of approved hospitals are public.
    departments: approved
      ? departments.filter((d) => d.confirmed).map((d) => ({ id: d.id, name: d.name, verifiedAt: d.lastVerifiedAt }))
      : [],
    specialists: approved
      ? specialists.filter((s) => s.confirmed).map((s) => ({ id: s.id, name: s.name, specialty: s.specialty, onDuty: s.onDuty }))
      : [],
    ratingSummary: { average: b.hospital.ratingAverage, count: b.hospital.ratingCount },
  };
}

export async function compareHospitals(ctx: Ctx, cfg: FullConfig, ids: string[], origin: { lat: number; lng: number } | null) {
  const docs = (await Promise.all(ids.map((id) => ctx.store.get<HospitalDoc>(C.hospitals, id)))).filter(
    (h): h is HospitalDoc => !!h && (PUBLIC_STATES as readonly string[]).includes(h.verificationStatus),
  );
  const bundles = await loadBundles(ctx.store, docs);
  return { items: bundles.map((b) => toSummary(b, cfg, ctx.now, origin)) };
}

export async function createFlag(ctx: Ctx, hospitalId: string, input: FlagInput) {
  await getHospitalBundle(ctx.store, hospitalId);
  const id = ctx.store.newId("f_");
  const doc: FlagDoc = {
    id,
    hospitalId,
    field: input.field,
    description: input.description,
    status: "open",
    resolution: null,
    resolvedBy: null,
    reporterHash: ctx.ipHash,
    createdAt: ctx.now.toISOString(),
  };
  await ctx.store.set(C.flags, id, doc);
  return { id, status: "open" as const };
}
