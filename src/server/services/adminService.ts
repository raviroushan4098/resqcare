import type { KpiSet, Role, VerifyDecision } from "@/lib/schemas";
import { authorize } from "../auth/policies";
import { setRoleClaims } from "../auth/verifyToken";
import { lastHealth } from "../adapters/health";
import { env } from "../config/env";
import { availabilityTier } from "../domain/confidence";
import { geohash } from "../domain/geo";
import { conflict, notFound } from "../errors/AppError";
import type { Ctx } from "../http/router";
import {
  C,
  type ApplicationDoc,
  type AuditDoc,
  type AvailabilityDoc,
  type BookingDoc,
  type FacilityDoc,
  type FlagDoc,
  type HospitalDoc,
  type ProviderDoc,
  type SearchLogDoc,
  type UserDoc,
  type VerificationDoc,
} from "../repositories/collections";
import { DEMO_CITY } from "../seed/data";
import { audit, listAudit } from "./auditService";
import { getConfig } from "./configService";
import { invalidateHospitalCache } from "./hospitalService";
import { documentUrl } from "./storageService";

const DAY = 86_400_000;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
}

const reached = (b: BookingDoc, s: BookingDoc["status"]) => b.events.some((e) => e.state === s);

export async function overview(ctx: Ctx) {
  authorize(ctx.user, "admin.access");
  const since = new Date(ctx.now.getTime() - 7 * DAY).toISOString();
  const cfg = await getConfig(ctx.store, ctx.scenario);
  const [logs, bookings, approved, availability, pendingHospitals, openFlags, reportedReviews, pendingReviews, applications, pendingProviders, recentAudit] = await Promise.all([
    ctx.store.query<SearchLogDoc>(C.searchLogs, { where: [["createdAt", ">=", since]] }),
    ctx.store.query<BookingDoc>(C.bookings, { where: [["createdAt", ">=", since]] }),
    ctx.store.query<HospitalDoc>(C.hospitals, { where: [["verificationStatus", "==", "approved"]] }),
    ctx.store.query<AvailabilityDoc>(C.availability),
    ctx.store.count(C.hospitals, { where: [["verificationStatus", "==", "pending"]] }),
    ctx.store.count(C.flags, { where: [["status", "==", "open"]] }),
    ctx.store.count(C.reviews, { where: [["reportCount", ">", 0]] }),
    ctx.store.count(C.reviews, { where: [["status", "==", "pending"]] }),
    ctx.store.count(C.applications, { where: [["status", "==", "pending"]] }),
    ctx.store.count(C.providers, { where: [["status", "==", "pending"]] }),
    listAudit(ctx, { limit: 8 }),
  ]);
  const approvedIds = new Set(approved.map((h) => h.id));
  const fresh = availability.filter((a) => approvedIds.has(a.hospitalId) && availabilityTier(a.reportedAt, cfg.freshness.availabilityMinutes, ctx.now) === "confirmed").length;
  const decided = bookings.filter((b) => reached(b, "Accepted") || b.status === "Rejected" || b.status === "TimedOut");
  const accepted = bookings.filter((b) => reached(b, "Accepted"));
  const kpis: KpiSet = {
    searchLatencyP95Ms: percentile(logs.filter((l) => l.outcome === "ok").map((l) => l.latencyMs), 95),
    dataFreshnessPct: pct(fresh, approved.length),
    bookingAcceptanceRate: pct(accepted.length, decided.length),
    failedRequests: logs.filter((l) => l.outcome === "error").length + bookings.filter((b) => b.status === "Failed").length,
    dispatchCompletionRate: pct(accepted.filter((b) => b.status === "Completed").length, accepted.filter((b) => b.status !== "Accepted" && b.status !== "Assigned" && b.status !== "EnRoute" && b.status !== "Arrived").length),
  };
  return {
    kpis,
    queues: {
      pendingHospitals,
      flaggedAvailability: openFlags,
      reportedReviews,
      pendingReviews,
      providerApplications: applications + pendingProviders,
    },
    health: await health(ctx),
    recentAudit,
    windowDays: 7,
  };
}

export async function health(ctx: Ctx) {
  authorize(ctx.user, "admin.access");
  const last = lastHealth();
  const cfg = await getConfig(ctx.store, ctx.scenario);
  let dbOk = true;
  try {
    await ctx.store.get(C.config, "ranking");
  } catch {
    dbOk = false;
  }
  const item = (configured: boolean, key: "ai" | "maps" | "notifications") => ({
    configured,
    status: !configured ? "fallback" : last[key] ? (last[key]!.ok ? "ok" : "degraded") : "unknown",
    lastCheckedAt: last[key]?.at ?? null,
    detail: last[key]?.detail ?? (configured ? null : "Not configured; fallback in use"),
  });
  return {
    maps: item(Boolean(env().GOOGLE_ROUTES_API_KEY), "maps"),
    mapsClient: { configured: Boolean(env().NEXT_PUBLIC_GOOGLE_MAPS_KEY) },
    ai: item(Boolean(env().GEMINI_API_KEY), "ai"),
    notifications: { configured: true, status: last.notifications ? (last.notifications.ok ? "ok" : "degraded") : "ok", lastCheckedAt: last.notifications?.at ?? null, detail: "In-app notifications" },
    database: { configured: true, status: dbOk ? "ok" : "down", backend: ctx.store.kind },
    demoMode: cfg.demo.demoMode,
    authMode: env().AUTH_MODE,
  };
}

export async function adminHospitals(ctx: Ctx, q: { status?: string; q?: string }) {
  authorize(ctx.user, "admin.access");
  const cfg = await getConfig(ctx.store);
  const where: [string, "==", unknown][] = q.status ? [["verificationStatus", "==", q.status]] : [];
  const [hospitals, availability, flags] = await Promise.all([
    ctx.store.query<HospitalDoc>(C.hospitals, { where }),
    ctx.store.query<AvailabilityDoc>(C.availability),
    ctx.store.query<FlagDoc>(C.flags, { where: [["status", "==", "open"]] }),
  ]);
  const av = new Map(availability.map((a) => [a.hospitalId, a]));
  const term = q.q?.toLowerCase().trim();
  return {
    items: hospitals
      .filter((h) => !term || h.name.toLowerCase().includes(term) || (h.registryRef ?? "").toLowerCase().includes(term))
      .map((h) => {
        const a = av.get(h.id);
        return {
          id: h.id, name: h.name, city: h.city, verificationStatus: h.verificationStatus, verifiedAt: h.verifiedAt, registryRef: h.registryRef,
          availabilityUpdatedAt: a?.reportedAt ?? null,
          freshness: availabilityTier(a?.reportedAt ?? null, cfg.freshness.availabilityMinutes, ctx.now),
          openFlags: flags.filter((f) => f.hospitalId === h.id).length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function adminHospitalDetail(ctx: Ctx, id: string) {
  authorize(ctx.user, "admin.access");
  const h = await ctx.store.get<HospitalDoc>(C.hospitals, id);
  if (!h) throw notFound("Hospital");
  const [facilities, verifications, trail, flags] = await Promise.all([
    ctx.store.query<FacilityDoc>(C.facilities, { where: [["hospitalId", "==", id]] }),
    ctx.store.query<VerificationDoc>(C.verifications, { where: [["hospitalId", "==", id]], orderBy: [["submittedAt", "desc"]], limit: 5 }),
    listAudit(ctx, { hospitalId: id, limit: 30 }),
    ctx.store.query<FlagDoc>(C.flags, { where: [["hospitalId", "==", id]], orderBy: [["createdAt", "desc"]] }),
  ]);
  const latest = verifications[0] ?? null;
  return {
    hospital: h,
    facilitiesClaimed: facilities.filter((f) => f.present).map((f) => ({ capability: f.capability, confirmed: f.confirmed, lastVerifiedAt: f.lastVerifiedAt, source: f.source })),
    verification: latest
      ? { ...latest, documents: await Promise.all(latest.documents.map(async (d) => ({ name: d.name, contentType: d.contentType, url: await documentUrl(d.path) }))) }
      : null,
    auditTrail: trail,
    flags,
  };
}

const DECISION_STATUS = { approve: "approved", reject: "rejected", request_info: "pending", suspend: "suspended" } as const;

/** Approve, reject (reason), request info (reason) or suspend (reason). Approval stamps verifiedAt/By and is audited. */
export async function verifyHospital(ctx: Ctx, id: string, input: VerifyDecision) {
  authorize(ctx.user, "admin.access");
  const at = ctx.now.toISOString();
  const { before, after } = await ctx.store.transaction(async (tx) => {
    const h = await tx.get<HospitalDoc>(C.hospitals, id);
    if (!h) throw notFound("Hospital");
    const [latest] = await tx.query<VerificationDoc>(C.verifications, { where: [["hospitalId", "==", id]], orderBy: [["submittedAt", "desc"]], limit: 1 });
    const facilities = input.decision === "approve" && input.checklist.facilityEvidence ? await tx.query<FacilityDoc>(C.facilities, { where: [["hospitalId", "==", id]] }) : [];
    if (latest && latest.decision !== "pending" && latest.decidedAt && new Date(latest.decidedAt).getTime() > ctx.now.getTime() - 5000) {
      throw conflict("Another admin just decided this hospital. Reload to see the latest.");
    }
    const status = DECISION_STATUS[input.decision];
    const patch: Partial<HospitalDoc> = {
      verificationStatus: status,
      updatedAt: at,
      ...(input.decision === "approve" ? { verifiedAt: at, verifiedBy: ctx.user!.uid } : {}),
    };
    tx.update(C.hospitals, id, patch);
    if (latest) tx.update(C.verifications, latest.id, { decision: input.decision, reason: input.reason ?? null, checklist: input.checklist, decidedBy: ctx.user!.uid, decidedAt: at });
    // Facility evidence verified: hospital-declared capabilities become Confirmed.
    for (const f of facilities.filter((f) => f.present)) tx.update(C.facilities, f.id, { confirmed: true, lastVerifiedAt: at, verifiedBy: ctx.user!.uid, source: "admin" });
    return { before: { verificationStatus: h.verificationStatus }, after: { verificationStatus: status, reason: input.reason ?? null, checklist: input.checklist } };
  });
  invalidateHospitalCache();
  await audit(ctx, { action: `hospital.verify.${input.decision}`, resourceType: "hospital", resourceId: id, hospitalId: id, before, after });
  return after;
}

export async function listFlags(ctx: Ctx, status?: string) {
  authorize(ctx.user, "admin.access");
  const flags = await ctx.store.query<FlagDoc>(C.flags, { where: status ? [["status", "==", status]] : [], orderBy: [["createdAt", "desc"]] });
  const names = new Map<string, string>();
  for (const id of new Set(flags.map((f) => f.hospitalId))) names.set(id, (await ctx.store.get<HospitalDoc>(C.hospitals, id))?.name ?? id);
  return { items: flags.map((f) => ({ ...f, reporterHash: undefined, hospitalName: names.get(f.hospitalId) })) };
}

export async function resolveFlag(ctx: Ctx, id: string, resolution: string) {
  authorize(ctx.user, "admin.access");
  const f = await ctx.store.get<FlagDoc>(C.flags, id);
  if (!f) throw notFound("Flag");
  if (f.status === "resolved") throw conflict("Flag already resolved");
  await ctx.store.update(C.flags, id, { status: "resolved", resolution, resolvedBy: ctx.user.uid });
  await audit(ctx, { action: "flag.resolve", resourceType: "flag", resourceId: id, hospitalId: f.hospitalId, after: { resolution } });
  return { id, status: "resolved" };
}

export async function adminProviders(ctx: Ctx) {
  authorize(ctx.user, "admin.access");
  const [providers, applications, bookings] = await Promise.all([
    ctx.store.query<ProviderDoc>(C.providers),
    ctx.store.query<ApplicationDoc>(C.applications, { orderBy: [["createdAt", "desc"]] }),
    ctx.store.query<BookingDoc>(C.bookings, { where: [["createdAt", ">=", new Date(ctx.now.getTime() - 30 * DAY).toISOString()]] }),
  ]);
  const performance = providers.map((p) => {
    const offered = bookings.filter((b) => b.candidateProviderIds.includes(p.id) || b.providerId === p.id);
    const accepted = bookings.filter((b) => b.providerId === p.id && reached(b, "Accepted"));
    const responseTimes = accepted
      .map((b) => {
        const s = b.events.find((e) => e.state === "Searching");
        const a = b.events.find((e) => e.state === "Accepted");
        return s && a ? (new Date(a.at).getTime() - new Date(s.at).getTime()) / 1000 : null;
      })
      .filter((x): x is number => x !== null);
    return {
      providerId: p.id,
      name: p.name,
      acceptanceRate: pct(accepted.length, offered.length),
      medianResponseSec: percentile(responseTimes, 50),
      completionRate: pct(accepted.filter((b) => b.status === "Completed").length, accepted.length),
      trips: accepted.length,
    };
  });
  return { providers, applications: applications.filter((a) => a.type === "provider"), hospitalApplications: applications.filter((a) => a.type === "hospital"), performance };
}

/** Suspended providers stop receiving new requests (they drop out of candidate selection). */
export async function decideProvider(ctx: Ctx, id: string, decision: "approve" | "reject" | "suspend" | "reinstate", reason?: string) {
  authorize(ctx.user, "admin.access");
  const p = await ctx.store.get<ProviderDoc>(C.providers, id);
  if (p) {
    const status = { approve: "approved", reject: "rejected", suspend: "suspended", reinstate: "approved" }[decision] as ProviderDoc["status"];
    await ctx.store.update(C.providers, id, { status, decisionReason: reason ?? null, ...(status === "approved" ? { approvedAt: ctx.now.toISOString() } : {}), updatedAt: ctx.now.toISOString() });
    await audit(ctx, { action: `provider.${decision}`, resourceType: "provider", resourceId: id, before: { status: p.status }, after: { status, reason } });
    return { id, status };
  }
  return decideApplication(ctx, id, decision === "approve" ? "approve" : "reject", reason);
}

/** Approving an application creates the organisation and grants the applicant's role via custom claims. */
export async function decideApplication(ctx: Ctx, id: string, decision: "approve" | "reject", reason?: string) {
  authorize(ctx.user, "admin.access");
  const app = await ctx.store.get<ApplicationDoc>(C.applications, id);
  if (!app) throw notFound("Application");
  if (app.status !== "pending") throw conflict("Application already decided");
  const at = ctx.now.toISOString();
  let orgId: string | null = null;
  if (decision === "approve") {
    if (app.type === "provider") {
      orgId = ctx.store.newId("p_");
      await ctx.store.set(C.providers, orgId, {
        id: orgId, name: app.orgName, contactPhone: app.contactPhone, serviceArea: { center: { ...DEMO_CITY }, radiusKm: 15 }, status: "approved",
        isDemo: false, simulated: false, approvedAt: at, decisionReason: null, ownerUid: app.uid, createdAt: at, updatedAt: at,
      } satisfies ProviderDoc);
    } else {
      orgId = ctx.store.newId("h_");
      await ctx.store.set(C.hospitals, orgId, {
        id: orgId, name: app.orgName, address: "", city: app.city, location: { ...DEMO_CITY, geohash: geohash(DEMO_CITY.lat, DEMO_CITY.lng) },
        phones: [app.contactPhone], operatingHours: "", emergencyHours: "", emergency24x7: false, specialties: [], verificationStatus: "unverified",
        verifiedAt: null, verifiedBy: null, registryRef: app.registryRef, isFictional: false, ratingAverage: null, ratingCount: 0, createdAt: at, updatedAt: at,
      } satisfies HospitalDoc);
      invalidateHospitalCache();
    }
    const role: Role = app.type === "provider" ? "dispatcher" : "hospital_admin";
    const claims = { role, hospitalId: app.type === "hospital" ? orgId : null, providerId: app.type === "provider" ? orgId : null };
    const u = await ctx.store.get<UserDoc>(C.users, app.uid);
    if (u) await ctx.store.update(C.users, app.uid, { ...claims, permissions: role === "hospital_admin" ? ["updateAvailability", "respondRequests", "viewPatientContact"] : [], updatedAt: at });
    await setRoleClaims(app.uid, claims);
  }
  await ctx.store.update(C.applications, id, { status: decision === "approve" ? "approved" : "rejected", reason: reason ?? null, updatedAt: at });
  await audit(ctx, { action: `application.${decision}`, resourceType: "application", resourceId: id, after: { orgId, reason } });
  return { id, status: decision === "approve" ? "approved" : "rejected", orgId };
}

export async function setUserRole(ctx: Ctx, uid: string, input: { role: Role; hospitalId?: string | null; providerId?: string | null }) {
  authorize(ctx.user, "admin.access");
  const u = await ctx.store.get<UserDoc>(C.users, uid);
  if (!u) throw notFound("User");
  const claims = { role: input.role, hospitalId: input.hospitalId ?? null, providerId: input.providerId ?? null };
  await ctx.store.update(C.users, uid, { ...claims, updatedAt: ctx.now.toISOString() });
  await setRoleClaims(uid, claims);
  await audit(ctx, { action: "user.role.set", resourceType: "user", resourceId: uid, before: { role: u.role, hospitalId: u.hospitalId, providerId: u.providerId }, after: claims });
  return { uid, ...claims };
}

export async function auditLogs(ctx: Ctx, q: { resourceType?: string; actorUid?: string; resourceId?: string }) {
  authorize(ctx.user, "admin.access");
  return { items: await listAudit(ctx, { ...q, limit: 100 }) as AuditDoc[] };
}

/** System performance metrics. These do not describe clinical effectiveness. */
export async function analytics(ctx: Ctx, q: { from?: string; to?: string; category?: string; city?: string }) {
  authorize(ctx.user, "admin.access");
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : ctx.now;
  const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : new Date(to.getTime() - 13 * DAY);
  const cfg = await getConfig(ctx.store);
  let [logs, bookings] = await Promise.all([
    ctx.store.query<SearchLogDoc>(C.searchLogs, { where: [["createdAt", ">=", from.toISOString()], ["createdAt", "<=", to.toISOString()]] }),
    ctx.store.query<BookingDoc>(C.bookings, { where: [["createdAt", ">=", from.toISOString()], ["createdAt", "<=", to.toISOString()]] }),
  ]);
  if (q.category) logs = logs.filter((l) => l.category === q.category);
  if (q.city) {
    const c = q.city.toLowerCase();
    logs = logs.filter((l) => l.city.toLowerCase().includes(c));
  }
  const days: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
  const byDay = <T extends { createdAt: string }>(xs: T[]) => {
    const m = new Map<string, T[]>(days.map((d) => [d, []]));
    for (const x of xs) m.get(x.createdAt.slice(0, 10))?.push(x);
    return m;
  };
  const logDays = byDay(logs);
  const bookDays = byDay(bookings);

  const [approved, availability] = await Promise.all([
    ctx.store.query<HospitalDoc>(C.hospitals, { where: [["verificationStatus", "==", "approved"]] }),
    ctx.store.query<AvailabilityDoc>(C.availability),
  ]);
  const freshness = { confirmed: 0, reported: 0, unknown: 0 };
  for (const h of approved) {
    const a = availability.find((x) => x.hospitalId === h.id);
    freshness[availabilityTier(a?.reportedAt ?? null, cfg.freshness.availabilityMinutes, ctx.now)]++;
  }

  const failures = new Map<string, number>();
  for (const l of logs.filter((l) => l.outcome === "error")) failures.set(`search_${l.errorCause ?? "unknown"}`, (failures.get(`search_${l.errorCause ?? "unknown"}`) ?? 0) + 1);
  for (const b of bookings) if (["Failed", "TimedOut", "Rejected", "Cancelled"].includes(b.status)) failures.set(`booking_${b.status}`, (failures.get(`booking_${b.status}`) ?? 0) + 1);

  const series = {
    searchesPerDay: days.map((d) => ({ date: d, searches: logDays.get(d)!.length })),
    latency: days.map((d) => {
      const ok = logDays.get(d)!.filter((l) => l.outcome === "ok").map((l) => l.latencyMs);
      return { date: d, p50: percentile(ok, 50), p95: percentile(ok, 95) };
    }),
    noMatchRate: days.map((d) => {
      const xs = logDays.get(d)!.filter((l) => l.outcome === "ok");
      return { date: d, rate: pct(xs.filter((l) => l.noConfidentMatch).length, xs.length) };
    }),
    bookingFunnel: (["Requested", "Searching", "Accepted", "Assigned", "EnRoute", "Arrived", "Completed"] as const).map((s) => ({ stage: s, count: bookings.filter((b) => reached(b, s)).length })),
    acceptanceCompletion: days.map((d) => {
      const xs = bookDays.get(d)!;
      const accepted = xs.filter((b) => reached(b, "Accepted"));
      const decided = xs.filter((b) => reached(b, "Accepted") || b.status === "Rejected" || b.status === "TimedOut");
      return { date: d, acceptance: pct(accepted.length, decided.length), completion: pct(accepted.filter((b) => b.status === "Completed").length, accepted.length) };
    }),
    freshnessDistribution: [
      { tier: "confirmed", hospitals: freshness.confirmed },
      { tier: "reported", hospitals: freshness.reported },
      { tier: "unknown", hospitals: freshness.unknown },
    ],
    failuresByCause: [...failures.entries()].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count),
  };
  const partial = days.some((d) => logDays.get(d)!.length === 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), series, partial, totals: { searches: logs.length, bookings: bookings.length } };
}
