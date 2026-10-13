import type { AmbulanceType } from "@/lib/schemas";
import { maskPhone } from "@/lib/format";
import { authorize } from "../auth/policies";
import { notify } from "../adapters/notifier/inApp";
import { straightLineEstimate } from "../adapters/maps/haversine";
import { SEARCHING_TIMEOUT_MS } from "../config/constants";
import { interpolate } from "../domain/geo";
import { conflict, forbidden, notFound } from "../errors/AppError";
import type { Ctx } from "../http/router";
import { C, type AmbulanceDoc, type BookingDoc, type HospitalDoc, type ProviderDoc, type UserDoc } from "../repositories/collections";
import { audit } from "./auditService";
import { buildView, pushEvent } from "./bookingService";
import { getConfig } from "./configService";

const SIM_TRAVEL_STEPS = 4; // EnRoute lasts this many step delays

/**
 * Demo ambulance adapter: advances simulated bookings on a timer. Runs lazily
 * on reads and from POST /jobs/demo-ticker, and catches up on missed steps
 * using scheduled times, so it works on serverless hosts too.
 * Also applies the Searching timeout to every booking.
 */
export async function tickBooking(ctx: Pick<Ctx, "store" | "now" | "scenario">, booking: BookingDoc): Promise<BookingDoc> {
  if (["Completed", "Cancelled", "Rejected", "TimedOut", "Failed"].includes(booking.status)) return booking;
  const cfg = await getConfig(ctx.store, ctx.scenario);
  const sim = booking.demo && cfg.demo.simulateDispatch;
  const step = cfg.demo.stepDelaySec * 1000;
  const now = ctx.now.getTime();

  return ctx.store.transaction(async (tx) => {
    const b = await tx.get<BookingDoc>(C.bookings, booking.id);
    if (!b) return booking;
    let changed = false;
    const last = () => new Date(b.events.at(-1)!.at).getTime();
    const sysEvent = (state: BookingDoc["status"], at: number, note: string | null = null) => {
      pushEvent(b, state, new Date(at).toISOString(), "system", "system", note);
      changed = true;
    };

    let simProvider: ProviderDoc | null = null;
    if (sim) {
      const providers = await tx.query<ProviderDoc>(C.providers, { where: [["simulated", "==", true], ["status", "==", "approved"]] });
      simProvider = providers.find((p) => b.candidateProviderIds.includes(p.id) && !b.rejectedBy.includes(p.id)) ?? null;
      if (b.providerId && b.providerId !== simProvider?.id) simProvider = null; // a human dispatcher took it
    }
    const ambulances = simProvider ? await tx.query<AmbulanceDoc>(C.ambulances, { where: [["providerId", "==", simProvider.id]] }) : [];

    for (let guard = 0; simProvider && guard < 8; guard++) {
      const t = last();
      if (b.status === "Searching" && now - t >= cfg.demo.acceptDelaySec * 1000) {
        b.providerId = simProvider.id;
        sysEvent("Accepted", t + cfg.demo.acceptDelaySec * 1000, "demo_simulated_accept");
      } else if (b.status === "Accepted" && now - t >= step) {
        const amb = ambulances.find((a) => a.status === "available" && a.driverId && (b.type === "basic" || a.type === "als")) ?? ambulances.find((a) => a.status === "available" && a.driverId);
        if (!amb) break; // wait for a free vehicle
        amb.status = "busy";
        amb.currentBookingId = b.id;
        tx.update(C.ambulances, amb.id, { status: "busy", currentBookingId: b.id });
        b.ambulanceId = amb.id;
        b.driverId = amb.driverId;
        // Start 3 to 5 km away from the pickup.
        const angle = (parseInt(b.id.slice(-4), 16) % 360) * (Math.PI / 180);
        b.simStart = { lat: b.pickup.lat + 0.03 * Math.cos(angle), lng: b.pickup.lng + 0.03 * Math.sin(angle) };
        sysEvent("Assigned", t + step);
      } else if (b.status === "Assigned" && now - t >= step) {
        sysEvent("EnRoute", t + step);
      } else if (b.status === "EnRoute" && now - t >= step * SIM_TRAVEL_STEPS) {
        b.lastLocation = { ...b.pickup, at: new Date(t + step * SIM_TRAVEL_STEPS).toISOString() };
        b.etaMinutes = 0;
        sysEvent("Arrived", t + step * SIM_TRAVEL_STEPS);
      } else if (b.status === "Arrived" && now - t >= step * 2) {
        sysEvent("Completed", t + step * 2);
        if (b.ambulanceId) tx.update(C.ambulances, b.ambulanceId, { status: "available", currentBookingId: null });
      } else break;
    }

    // Searching timeout applies to real and demo bookings alike. It runs after the
    // simulation so a catch-up acceptance that happened in time is not overridden.
    if (b.status === "Searching" && b.searchingSince && now - new Date(b.searchingSince).getTime() > SEARCHING_TIMEOUT_MS) {
      sysEvent("TimedOut", new Date(b.searchingSince).getTime() + SEARCHING_TIMEOUT_MS, "searching_timeout");
    }

    // Simulated live location while assigned or en route.
    if (simProvider && b.simStart && (b.status === "Assigned" || b.status === "EnRoute")) {
      const progress = b.status === "Assigned" ? 0 : Math.min(1, (now - last()) / (step * SIM_TRAVEL_STEPS));
      const p = interpolate(b.simStart, b.pickup, progress);
      b.lastLocation = { lat: p.lat, lng: p.lng, at: ctx.now.toISOString() };
      b.etaMinutes = straightLineEstimate(p, b.pickup).etaMinutes;
      changed = true;
    }

    if (changed) tx.set(C.bookings, b.id, b);
    return b;
  });
}

/** Cron: advance every active demo booking and apply timeouts. */
export async function tickAll(ctx: Pick<Ctx, "store" | "now" | "scenario">) {
  const active = await ctx.store.query<BookingDoc>(C.bookings, { where: [["status", "in", ["Requested", "Searching", "Accepted", "Assigned", "EnRoute", "Arrived"]]] });
  for (const b of active) await tickBooking(ctx, b);
  return { processed: active.length };
}

// ---- Dispatcher -------------------------------------------------------------

function requireProvider(ctx: Ctx) {
  authorize(ctx.user, "provider.read");
  return ctx.user.providerId!;
}

export async function providerQueue(ctx: Ctx) {
  const providerId = requireProvider(ctx);
  const [searching, mine] = await Promise.all([
    ctx.store.query<BookingDoc>(C.bookings, { where: [["status", "==", "Searching"], ["candidateProviderIds", "array-contains", providerId]] }),
    ctx.store.query<BookingDoc>(C.bookings, { where: [["providerId", "==", providerId], ["status", "in", ["Accepted", "Assigned", "EnRoute", "Arrived"]]] }),
  ]);
  const ticked = await Promise.all([...searching, ...mine].map((b) => tickBooking(ctx, b)));
  const byId = new Map(ticked.map((b) => [b.id, b]));
  const hospitals = new Map<string, HospitalDoc | null>();
  for (const b of byId.values()) if (b.destinationHospitalId && !hospitals.has(b.destinationHospitalId)) hospitals.set(b.destinationHospitalId, await ctx.store.get<HospitalDoc>(C.hospitals, b.destinationHospitalId));
  const row = (b: BookingDoc) => ({
    id: b.id,
    status: b.status,
    type: b.type,
    demo: b.demo,
    patientCount: b.patientCount,
    pickup: b.pickup,
    destinationName: b.destinationHospitalId ? hospitals.get(b.destinationHospitalId)?.name ?? null : null,
    createdAt: b.createdAt,
    searchingSince: b.searchingSince,
    expiresAt: b.searchingSince ? new Date(new Date(b.searchingSince).getTime() + SEARCHING_TIMEOUT_MS).toISOString() : null,
    contactMasked: maskPhone(b.contact.phone),
    ambulanceId: b.ambulanceId,
    driverId: b.driverId,
    lastLocation: b.lastLocation,
    rejectedByMe: b.rejectedBy.includes(providerId),
  });
  const all = [...byId.values()];
  return {
    incoming: all.filter((b) => b.status === "Searching" && !b.rejectedBy.includes(providerId)).map(row),
    active: all.filter((b) => b.providerId === providerId && b.status !== "Searching").map(row),
  };
}

export async function acceptBooking(ctx: Ctx, id: string) {
  const providerId = requireProvider(ctx);
  authorize(ctx.user, "provider.dispatch", { providerId });
  const b = await ctx.store.transaction(async (tx) => {
    const b = await tx.get<BookingDoc>(C.bookings, id);
    if (!b) throw notFound("Booking");
    if (!b.candidateProviderIds.includes(providerId)) throw forbidden();
    if (b.status !== "Searching") throw conflict("This request is no longer waiting for a provider", [{ path: "status", issue: b.status }]);
    b.providerId = providerId;
    pushEvent(b, "Accepted", ctx.now.toISOString(), ctx.user!.uid, "dispatcher");
    tx.set(C.bookings, b.id, b);
    return b;
  });
  await notify(ctx.store, { userId: b.patientUid, type: "booking.accepted", title: "Ambulance provider accepted", body: "A provider accepted your request.", resourceRef: b.id }, ctx.now);
  await audit(ctx, { action: "booking.accept", resourceType: "booking", resourceId: id, before: { status: "Searching" }, after: { status: "Accepted", providerId } });
  return buildView(ctx.store, b, ctx.user, ctx.now);
}

export async function rejectBooking(ctx: Ctx, id: string, reason: string) {
  const providerId = requireProvider(ctx);
  authorize(ctx.user, "provider.dispatch", { providerId });
  const b = await ctx.store.transaction(async (tx) => {
    const b = await tx.get<BookingDoc>(C.bookings, id);
    if (!b) throw notFound("Booking");
    if (!b.candidateProviderIds.includes(providerId)) throw forbidden();
    if (b.status !== "Searching") throw conflict("This request is no longer waiting for a provider", [{ path: "status", issue: b.status }]);
    if (!b.rejectedBy.includes(providerId)) b.rejectedBy.push(providerId);
    if (b.candidateProviderIds.every((p) => b.rejectedBy.includes(p))) {
      pushEvent(b, "Rejected", ctx.now.toISOString(), ctx.user!.uid, "dispatcher", reason);
    }
    b.updatedAt = ctx.now.toISOString();
    tx.set(C.bookings, b.id, b);
    return b;
  });
  await audit(ctx, { action: "booking.reject", resourceType: "booking", resourceId: id, after: { providerId, reason } });
  return buildView(ctx.store, b, ctx.user, ctx.now);
}

/**
 * Assigns a vehicle and driver in one transaction. The vehicle must be
 * available and belong to this provider; a second simultaneous assign of the
 * same vehicle gets 409.
 */
export async function assignBooking(ctx: Ctx, id: string, ambulanceId: string, driverId: string) {
  const providerId = requireProvider(ctx);
  authorize(ctx.user, "provider.dispatch", { providerId });
  const b = await ctx.store.transaction(async (tx) => {
    const b = await tx.get<BookingDoc>(C.bookings, id);
    const amb = await tx.get<AmbulanceDoc>(C.ambulances, ambulanceId);
    const driver = await tx.get<UserDoc>(C.users, driverId);
    const driverBusy = await tx.query<AmbulanceDoc>(C.ambulances, { where: [["driverId", "==", driverId], ["status", "==", "busy"]] });
    if (!b) throw notFound("Booking");
    if (b.providerId !== providerId) throw forbidden();
    if (b.status !== "Accepted") throw conflict("Booking is not waiting for a vehicle", [{ path: "status", issue: b.status }]);
    if (!amb || amb.providerId !== providerId) throw notFound("Vehicle");
    if (!driver || driver.role !== "driver" || driver.providerId !== providerId) throw notFound("Driver");
    if (amb.status !== "available" || amb.currentBookingId) {
      throw conflict("This vehicle is already assigned to another trip", [{ path: "ambulanceId", issue: "vehicle_already_assigned" }]);
    }
    if (driverBusy.some((a) => a.id !== amb.id)) throw conflict("This driver is already on another trip", [{ path: "driverId", issue: "driver_busy" }]);
    tx.update(C.ambulances, amb.id, { status: "busy", currentBookingId: b.id, driverId, updatedAt: ctx.now.toISOString() });
    b.ambulanceId = amb.id;
    b.driverId = driverId;
    pushEvent(b, "Assigned", ctx.now.toISOString(), ctx.user!.uid, "dispatcher");
    tx.set(C.bookings, b.id, b);
    return b;
  });
  await notify(ctx.store, { userId: driverId, type: "trip.assigned", title: "New trip assigned", body: "Open your dashboard to start the trip.", resourceRef: id }, ctx.now);
  await audit(ctx, { action: "booking.assign", resourceType: "booking", resourceId: id, after: { ambulanceId, driverId } });
  return buildView(ctx.store, b, ctx.user, ctx.now);
}

export async function listFleet(ctx: Ctx) {
  const providerId = requireProvider(ctx);
  const [ambulances, drivers, provider] = await Promise.all([
    ctx.store.query<AmbulanceDoc>(C.ambulances, { where: [["providerId", "==", providerId]], orderBy: [["registration", "asc"]] }),
    ctx.store.query<UserDoc>(C.users, { where: [["providerId", "==", providerId], ["role", "==", "driver"]] }),
    ctx.store.get<ProviderDoc>(C.providers, providerId),
  ]);
  return {
    provider,
    ambulances,
    drivers: drivers.map((d) => ({ id: d.id, displayName: d.displayName, phoneMasked: maskPhone(d.phone), status: d.status })),
  };
}

export async function createAmbulance(ctx: Ctx, input: { registration: string; type: AmbulanceType; driverId: string | null }) {
  const providerId = requireProvider(ctx);
  authorize(ctx.user, "provider.fleet.manage", { providerId });
  const dupe = await ctx.store.query<AmbulanceDoc>(C.ambulances, { where: [["registration", "==", input.registration]] });
  if (dupe.length) throw conflict("A vehicle with this registration already exists", [{ path: "registration", issue: "duplicate" }]);
  const id = ctx.store.newId("a_");
  const at = ctx.now.toISOString();
  const doc: AmbulanceDoc = { id, providerId, registration: input.registration, type: input.type, driverId: input.driverId, status: "offline", currentBookingId: null, lastLocation: null, createdAt: at, updatedAt: at };
  await ctx.store.set(C.ambulances, id, doc);
  await audit(ctx, { action: "ambulance.create", resourceType: "ambulance", resourceId: id, after: doc });
  return doc;
}

export async function updateAmbulance(ctx: Ctx, id: string, patch: { status?: "available" | "offline"; driverId?: string | null; type?: AmbulanceType }) {
  const providerId = requireProvider(ctx);
  authorize(ctx.user, "provider.fleet.manage", { providerId });
  const amb = await ctx.store.get<AmbulanceDoc>(C.ambulances, id);
  if (!amb || amb.providerId !== providerId) throw notFound("Vehicle");
  if (amb.status === "busy") throw conflict("Vehicle is on a trip", [{ path: "status", issue: "busy" }]);
  await ctx.store.update(C.ambulances, id, { ...patch, updatedAt: ctx.now.toISOString() });
  await audit(ctx, { action: "ambulance.update", resourceType: "ambulance", resourceId: id, before: amb, after: patch });
  return { ...amb, ...patch };
}

export async function createDriver(ctx: Ctx, input: { displayName: string; phone: string }) {
  const providerId = requireProvider(ctx);
  authorize(ctx.user, "provider.fleet.manage", { providerId });
  const id = ctx.store.newId("u_drv_");
  const at = ctx.now.toISOString();
  const doc: UserDoc = { id, displayName: input.displayName, email: null, phone: input.phone, role: "driver", hospitalId: null, providerId, permissions: [], locale: "en", status: "invited", consentAt: null, lastLoginAt: null, createdAt: at, updatedAt: at };
  await ctx.store.set(C.users, id, doc);
  await audit(ctx, { action: "driver.create", resourceType: "user", resourceId: id, after: { displayName: input.displayName } });
  return { id, displayName: doc.displayName, phoneMasked: maskPhone(doc.phone), status: doc.status };
}

export async function updateServiceArea(ctx: Ctx, area: { center: { lat: number; lng: number }; radiusKm: number }) {
  const providerId = requireProvider(ctx);
  authorize(ctx.user, "provider.fleet.manage", { providerId });
  const before = await ctx.store.get<ProviderDoc>(C.providers, providerId);
  await ctx.store.update(C.providers, providerId, { serviceArea: area, updatedAt: ctx.now.toISOString() });
  await audit(ctx, { action: "provider.serviceArea.update", resourceType: "provider", resourceId: providerId, before: before?.serviceArea, after: area });
  return area;
}

export async function providerStats(ctx: Ctx) {
  const providerId = requireProvider(ctx);
  const all = await ctx.store.query<BookingDoc>(C.bookings, { where: [["candidateProviderIds", "array-contains", providerId]] });
  const mine = await ctx.store.query<BookingDoc>(C.bookings, { where: [["providerId", "==", providerId]] });
  return {
    accepted: mine.filter((b) => b.events.some((e) => e.state === "Accepted")).length,
    rejected: all.filter((b) => b.rejectedBy.includes(providerId)).length,
    completed: mine.filter((b) => b.status === "Completed").length,
    active: mine.filter((b) => ["Accepted", "Assigned", "EnRoute", "Arrived"].includes(b.status)).length,
  };
}
