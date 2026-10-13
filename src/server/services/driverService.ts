import type { LocationBatch } from "@/lib/schemas";
import { maskPhone } from "@/lib/format";
import { authorize } from "../auth/policies";
import { straightLineEstimate } from "../adapters/maps/haversine";
import { LOCATION_THROTTLE_MS, LOCATION_TTL_AFTER_TRIP_MS } from "../config/constants";
import { nextDriverStep } from "../domain/bookingStateMachine";
import { conflict, forbidden, notFound } from "../errors/AppError";
import type { Ctx } from "../http/router";
import { C, type AmbulanceDoc, type BookingDoc, type HospitalDoc, type LocationDoc } from "../repositories/collections";
import { audit } from "./auditService";
import { pushEvent } from "./bookingService";

const ACTIVE = ["Assigned", "EnRoute", "Arrived"] as const;

/** The driver's single current trip (drivers see only their own). */
export async function currentAssignment(ctx: Ctx) {
  authorize(ctx.user, "driver.assignment.read");
  const [active] = await ctx.store.query<BookingDoc>(C.bookings, {
    where: [["driverId", "==", ctx.user.uid], ["status", "in", [...ACTIVE]]],
    limit: 1,
  });
  const history = await ctx.store.query<BookingDoc>(C.bookings, {
    where: [["driverId", "==", ctx.user.uid], ["status", "in", ["Completed", "Cancelled", "Failed"]]],
    orderBy: [["updatedAt", "desc"]],
    limit: 10,
  });
  let assignment = null;
  if (active) {
    const [dest, amb] = await Promise.all([
      active.destinationHospitalId ? ctx.store.get<HospitalDoc>(C.hospitals, active.destinationHospitalId) : null,
      active.ambulanceId ? ctx.store.get<AmbulanceDoc>(C.ambulances, active.ambulanceId) : null,
    ]);
    assignment = {
      bookingId: active.id,
      status: active.status,
      demo: active.demo,
      type: active.type,
      patientCount: active.patientCount,
      pickup: active.pickup,
      destination: dest ? { name: dest.name, lat: dest.location.lat, lng: dest.location.lng, phone: dest.phones[0] ?? "" } : null,
      // Limited contact: first name and a callable number for coordination only.
      contact: { firstName: active.contact.name.split(" ")[0] ?? "", phone: active.contact.phone, phoneMasked: maskPhone(active.contact.phone) },
      note: active.note,
      vehicle: amb ? { registration: amb.registration, type: amb.type } : null,
      nextStep: nextDriverStep(active.status),
      locationSharingAllowed: active.status === "Assigned" || active.status === "EnRoute",
    };
  }
  return {
    assignment,
    history: history.map((b) => ({ bookingId: b.id, status: b.status, completedAt: b.updatedAt, type: b.type })),
  };
}

/** Advances exactly one step. Any other transition is rejected with 409. */
export async function advanceStatus(ctx: Ctx, bookingId: string, status: "EnRoute" | "Arrived" | "Completed") {
  const b = await ctx.store.transaction(async (tx) => {
    const b = await tx.get<BookingDoc>(C.bookings, bookingId);
    if (!b) throw notFound("Booking");
    if (b.driverId !== ctx.user?.uid) throw forbidden();
    authorize(ctx.user, "driver.booking.advance", b as unknown as Record<string, unknown>);
    if (nextDriverStep(b.status) !== status) {
      throw conflict(`Next step is ${nextDriverStep(b.status) ?? "none"}, not ${status}`, [{ path: "status", issue: "invalid_transition" }]);
    }
    pushEvent(b, status, ctx.now.toISOString(), ctx.user.uid, "driver");
    if (status === "Completed" && b.ambulanceId) tx.update(C.ambulances, b.ambulanceId, { status: "available", currentBookingId: null });
    if (status === "Arrived") b.etaMinutes = 0;
    tx.set(C.bookings, b.id, b);
    return b;
  });
  await audit(ctx, { action: `booking.${status}`, resourceType: "booking", resourceId: bookingId, after: { status } });
  return { status: b.status, nextStep: nextDriverStep(b.status) };
}

/**
 * Ingests buffered location points for the driver's active trip, keeping at
 * most one point per 5 s. Points are only accepted while Assigned or EnRoute,
 * so sharing stops on its own when the trip ends.
 */
export async function ingestLocation(ctx: Ctx, batch: LocationBatch) {
  const b = await ctx.store.get<BookingDoc>(C.bookings, batch.bookingId);
  if (!b) throw notFound("Booking");
  authorize(ctx.user, "driver.location.write", b as unknown as Record<string, unknown>);
  if (b.status !== "Assigned" && b.status !== "EnRoute") {
    return { accepted: 0, sharing: false };
  }
  const points = [...batch.points].sort((a, c) => a.ts.localeCompare(c.ts));
  let lastTs = b.lastLocation ? new Date(b.lastLocation.at).getTime() : 0;
  let accepted = 0;
  let latest: (typeof points)[number] | null = null;
  for (const p of points) {
    const t = Math.min(new Date(p.ts).getTime(), ctx.now.getTime()); // never trust future device clocks
    if (t - lastTs < LOCATION_THROTTLE_MS) continue;
    const id = ctx.store.newId("loc_");
    const doc: LocationDoc = {
      id, bookingId: b.id, driverId: ctx.user!.uid, lat: p.lat, lng: p.lng, accuracy: p.accuracy ?? null,
      ts: new Date(t).toISOString(), expiresAt: new Date(t + LOCATION_TTL_AFTER_TRIP_MS * 2).toISOString(),
    };
    await ctx.store.set(C.locations(b.id), id, doc);
    lastTs = t;
    latest = { ...p, ts: doc.ts };
    accepted++;
  }
  if (latest) {
    const loc = { lat: latest.lat, lng: latest.lng, at: latest.ts };
    await ctx.store.update(C.bookings, b.id, { lastLocation: loc, etaMinutes: straightLineEstimate(loc, b.pickup).etaMinutes, updatedAt: ctx.now.toISOString() });
    if (b.ambulanceId) await ctx.store.update(C.ambulances, b.ambulanceId, { lastLocation: loc });
  }
  return { accepted, sharing: true };
}
