import type { AvailabilityUpdate, PortalAvailability } from "@/lib/schemas";
import { authorize } from "../auth/policies";
import { availabilityTier } from "../domain/confidence";
import { AppError } from "../errors/AppError";
import type { Ctx } from "../http/router";
import { C, type AvailabilityDoc, type AvailabilityHistoryDoc } from "../repositories/collections";
import { audit } from "./auditService";
import { getConfig } from "./configService";

const NINETY_DAYS = 90 * 24 * 3600 * 1000;
const empty = { available: 0, total: 0 };

function toPortal(a: AvailabilityDoc | null, minutes: number, now: Date): PortalAvailability {
  return {
    icuBeds: a?.icuBeds ?? empty,
    emergencyBeds: a?.emergencyBeds ?? empty,
    ventilators: a?.ventilators ?? empty,
    servicesNow: a?.servicesNow ?? { ct: false, cathLab: false, specialistOnDuty: false },
    updatedAt: a?.reportedAt ?? null,
    updatedByName: a?.updatedByName ?? null,
    version: a?.version ?? 0,
    tier: availabilityTier(a?.reportedAt ?? null, minutes, now),
  };
}

export async function getPortalAvailability(ctx: Ctx) {
  authorize(ctx.user, "hospital.portal.read");
  const hospitalId = ctx.user.hospitalId!;
  const cfg = await getConfig(ctx.store);
  const a = await ctx.store.get<AvailabilityDoc>(C.availability, hospitalId);
  return { current: toPortal(a, cfg.freshness.availabilityMinutes, ctx.now), freshnessMinutes: cfg.freshness.availabilityMinutes };
}

export async function availabilityHistory(ctx: Ctx) {
  authorize(ctx.user, "hospital.portal.read");
  const items = await ctx.store.query<AvailabilityHistoryDoc>(C.availabilityHistory(ctx.user.hospitalId!), { orderBy: [["at", "desc"]], limit: 20 });
  return { items };
}

/**
 * Writes availability with a server timestamp. If someone else saved since
 * the editor loaded (version mismatch), returns 409 with the latest values so
 * the UI can show them and ask to reapply.
 */
export async function updateAvailability(ctx: Ctx, input: AvailabilityUpdate) {
  authorize(ctx.user, "hospital.availability.update", { hospitalId: ctx.user?.hospitalId });
  const hospitalId = ctx.user.hospitalId!;
  const cfg = await getConfig(ctx.store);
  const at = ctx.now.toISOString();
  const result = await ctx.store.transaction(async (tx) => {
    const current = await tx.get<AvailabilityDoc>(C.availability, hospitalId);
    const version = current?.version ?? 0;
    if (version !== input.expectedVersion) {
      return { conflict: true as const, latest: toPortal(current, cfg.freshness.availabilityMinutes, ctx.now), before: current };
    }
    const next: AvailabilityDoc = {
      id: hospitalId,
      hospitalId,
      icuBeds: input.icuBeds,
      emergencyBeds: input.emergencyBeds,
      ventilators: input.ventilators,
      servicesNow: input.servicesNow,
      updatedAt: at,
      reportedAt: at,
      updatedBy: ctx.user!.uid,
      updatedByName: ctx.user!.displayName,
      source: "hospital",
      version: version + 1,
      stale: false,
      createdAt: current?.createdAt ?? at,
    };
    tx.set(C.availability, hospitalId, next);
    const hid = `${ctx.now.getTime()}`;
    tx.set(C.availabilityHistory(hospitalId), hid, {
      id: hid, hospitalId, icuBeds: next.icuBeds, emergencyBeds: next.emergencyBeds, ventilators: next.ventilators,
      servicesNow: next.servicesNow, at, byName: ctx.user!.displayName, expiresAt: new Date(ctx.now.getTime() + NINETY_DAYS).toISOString(),
    } satisfies AvailabilityHistoryDoc);
    return { conflict: false as const, saved: next, before: current };
  });
  if (result.conflict) {
    const err = new AppError("CONFLICT", "Availability was updated by someone else. Review the latest values and apply your change again.", {
      details: [{ path: "expectedVersion", issue: `latest_version_${result.latest.version}` }],
    });
    throw err;
  }
  await audit(ctx, {
    action: "availability.update",
    resourceType: "hospitalAvailability",
    resourceId: hospitalId,
    hospitalId,
    before: result.before ? { icuBeds: result.before.icuBeds, emergencyBeds: result.before.emergencyBeds, ventilators: result.before.ventilators } : null,
    after: { icuBeds: input.icuBeds, emergencyBeds: input.emergencyBeds, ventilators: input.ventilators, servicesNow: input.servicesNow },
  });
  return { current: toPortal(result.saved, cfg.freshness.availabilityMinutes, ctx.now) };
}
