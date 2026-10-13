import { randomBytes, timingSafeEqual } from "node:crypto";
import type { BookingStatus, BookingView, CreateBookingInput, Role } from "@/lib/schemas";
import { CreateBookingSchema, TERMINAL_STATUSES } from "@/lib/schemas";
import { maskPhone } from "@/lib/format";
import { can } from "../auth/policies";
import type { AuthUser } from "../auth/roles";
import { notify } from "../adapters/notifier/inApp";
import { straightLineEstimate } from "../adapters/maps/haversine";
import { IDEMPOTENCY_TTL_MS, LOCATION_FRESH_MS, SEARCHING_TIMEOUT_MS, SHARE_LINK_TTL_MS } from "../config/constants";
import type { DocStore, Tx } from "../db/store";
import { canTransition, isCancellable } from "../domain/bookingStateMachine";
import { haversineKm } from "../domain/geo";
import { AppError, conflict, forbidden, notFound, ruleViolation } from "../errors/AppError";
import type { Ctx } from "../http/router";
import {
  C,
  type AmbulanceDoc,
  type BookingDoc,
  type FacilityDoc,
  type HospitalDoc,
  type IdempotencyDoc,
  type ProviderDoc,
  type UserDoc,
} from "../repositories/collections";
import { getConfig } from "./configService";
import { tickBooking } from "./dispatchService";

export function pushEvent(b: BookingDoc, state: BookingStatus, at: string, by: string, byRole: Role | "system", note: string | null = null) {
  if (!canTransition(b.status, state, byRole)) {
    throw conflict(`Cannot move booking from ${b.status} to ${state}`, [{ path: "status", issue: "invalid_transition" }]);
  }
  b.status = state;
  b.updatedAt = at;
  b.events.push({ state, at, by, byRole, note });
  if (state === "Searching") b.searchingSince = at;
}

async function nearestSuitableHospital(store: DocStore, pickup: { lat: number; lng: number }) {
  const hospitals = await store.query<HospitalDoc>(C.hospitals, { where: [["verificationStatus", "==", "approved"]] });
  const er = await store.query<FacilityDoc>(C.facilities, { where: [["capability", "==", "emergency_24x7"], ["present", "==", true]] });
  const ok = new Set(er.filter((f) => f.confirmed || f.lastVerifiedAt).map((f) => f.hospitalId));
  return hospitals.filter((h) => ok.has(h.id)).sort((a, b) => haversineKm(pickup, a.location) - haversineKm(pickup, b.location))[0] ?? null;
}

/**
 * Creates a booking exactly once per (user, Idempotency-Key). A replay returns
 * the original booking. Status starts as Requested and moves to Searching;
 * nothing reads as confirmed until a provider accepts.
 */
export async function createBooking(ctx: Ctx, input: CreateBookingInput, idempotencyKey: string | null) {
  const user = ctx.user!;
  if (!idempotencyKey || !/^[A-Za-z0-9-]{8,64}$/.test(idempotencyKey)) {
    throw new AppError("VALIDATION_FAILED", "Idempotency-Key header is required", { details: [{ path: "Idempotency-Key", issue: "required" }] });
  }
  const body = CreateBookingSchema.parse(input);
  const cfg = await getConfig(ctx.store, ctx.scenario);
  const keyId = `${user.uid}_${idempotencyKey}`;

  // Fast path for replays (double taps, retries after a lost response).
  const existingKey = await ctx.store.get<IdempotencyDoc>(C.idempotencyKeys, keyId);
  if (existingKey) return { booking: await viewFor(ctx, existingKey.bookingId), replayed: true };

  const providers = await ctx.store.query<ProviderDoc>(C.providers, { where: [["status", "==", "approved"]] });
  const candidates = providers.filter(
    (p) =>
      p.isDemo === cfg.demo.demoMode &&
      (!p.simulated || cfg.demo.simulateDispatch) &&
      haversineKm(p.serviceArea.center, body.pickup) <= p.serviceArea.radiusKm,
  );
  if (candidates.length === 0) {
    throw ruleViolation("No ambulance providers cover this pickup location", [{ path: "pickup", issue: "no_providers_in_range" }]);
  }

  let destination: HospitalDoc | null = null;
  if (body.destinationHospitalId) {
    destination = await ctx.store.get<HospitalDoc>(C.hospitals, body.destinationHospitalId);
    if (!destination || destination.verificationStatus === "suspended" || destination.verificationStatus === "rejected") throw notFound("Destination hospital");
  } else {
    destination = await nearestSuitableHospital(ctx.store, body.pickup);
  }

  const at = ctx.now.toISOString();
  const id = ctx.store.newId("b_");
  const booking: BookingDoc = {
    id,
    patientUid: user.uid,
    idempotencyKey,
    status: "Requested",
    demo: cfg.demo.demoMode,
    type: body.type,
    patientCount: body.patientCount,
    note: body.note || null,
    pickup: { lat: body.pickup.lat, lng: body.pickup.lng, address: body.pickup.address || null },
    destinationHospitalId: destination?.id ?? null,
    providerId: null,
    candidateProviderIds: candidates.map((p) => p.id),
    rejectedBy: [],
    ambulanceId: null,
    driverId: null,
    contact: { name: body.contact.name, phone: body.contact.phone },
    events: [{ state: "Requested", at, by: user.uid, byRole: "patient", note: null }],
    shareToken: null,
    shareExpiresAt: null,
    searchingSince: null,
    lastLocation: null,
    etaMinutes: null,
    failureReason: null,
    simStart: null,
    createdAt: at,
    updatedAt: at,
  };
  pushEvent(booking, "Searching", at, "system", "system");

  // The key doc and booking are written in one transaction, so two
  // simultaneous requests with the same key produce exactly one booking.
  const winner = await ctx.store.transaction(async (tx) => {
    const k = await tx.get<IdempotencyDoc>(C.idempotencyKeys, keyId);
    if (k) return k.bookingId;
    tx.set(C.idempotencyKeys, keyId, { id: keyId, bookingId: id, createdAt: at, expiresAt: new Date(ctx.now.getTime() + IDEMPOTENCY_TTL_MS).toISOString() } satisfies IdempotencyDoc);
    tx.set(C.bookings, id, booking);
    return id;
  });
  if (winner !== id) return { booking: await viewFor(ctx, winner), replayed: true };

  for (const p of candidates.filter((p) => p.ownerUid)) {
    await notify(ctx.store, { userId: p.ownerUid!, type: "booking.new", title: "New ambulance request", body: "A new request is waiting in your queue.", resourceRef: id }, ctx.now);
  }
  return { booking: await viewFor(ctx, id), replayed: false };
}

export async function loadBooking(store: DocStore, id: string) {
  const b = await store.get<BookingDoc>(C.bookings, id);
  if (!b) throw notFound("Booking");
  return b;
}

const PHONE_REVEAL_STATES: BookingStatus[] = ["Assigned", "EnRoute", "Arrived"];
const LIVE_STATES: BookingStatus[] = ["Assigned", "EnRoute"];

function viewerRole(user: AuthUser | null, b: BookingDoc): BookingView["viewerRole"] {
  if (!user) return "shared";
  if (b.patientUid === user.uid) return "owner";
  if (user.role === "super_admin") return "admin";
  if (user.role === "driver") return "driver";
  if (user.role === "dispatcher") return "provider";
  return "hospital";
}

/** Builds the per-viewer booking view. Fields a viewer may not see are omitted, not just hidden. */
export async function buildView(store: DocStore, b: BookingDoc, user: AuthUser | null, now: Date): Promise<BookingView> {
  const role = viewerRole(user, b);
  const [dest, provider, ambulance, driver] = await Promise.all([
    b.destinationHospitalId ? store.get<HospitalDoc>(C.hospitals, b.destinationHospitalId) : null,
    b.providerId ? store.get<ProviderDoc>(C.providers, b.providerId) : null,
    b.ambulanceId ? store.get<AmbulanceDoc>(C.ambulances, b.ambulanceId) : null,
    b.driverId ? store.get<UserDoc>(C.users, b.driverId) : null,
  ]);
  const accepted = !["Requested", "Searching", "Rejected", "TimedOut"].includes(b.status) && !!provider;
  const canRevealPhone = (role === "owner" || role === "admin" || role === "provider") && PHONE_REVEAL_STATES.includes(b.status);
  const seesContact = role !== "shared" && can(user, "booking.viewContact", b as unknown as Record<string, unknown>);
  const live = LIVE_STATES.includes(b.status) && !!b.lastLocation && role !== "hospital";
  const fresh = live && now.getTime() - new Date(b.lastLocation!.at).getTime() <= LOCATION_FRESH_MS;

  return {
    id: b.id,
    status: b.status,
    demo: b.demo,
    type: b.type,
    patientCount: b.patientCount,
    pickup: role === "shared" ? { lat: Math.round(b.pickup.lat * 100) / 100, lng: Math.round(b.pickup.lng * 100) / 100, address: null } : b.pickup,
    destination: dest ? { hospitalId: dest.id, name: dest.name, phone: dest.phones[0] ?? "" } : null,
    provider: accepted ? { name: provider!.name, phone: provider!.contactPhone } : null,
    vehicle: accepted && ambulance ? { registration: ambulance.registration, type: ambulance.type } : null,
    driver:
      accepted && driver
        ? { firstName: driver.displayName.split(" ")[0] ?? "", phoneMasked: maskPhone(driver.phone), phone: canRevealPhone ? driver.phone : null }
        : null,
    contact:
      role === "shared"
        ? null
        : { name: seesContact ? b.contact.name : b.contact.name.split(" ")[0] ?? "", phoneMasked: maskPhone(b.contact.phone), phone: seesContact ? b.contact.phone : null },
    canRevealPhone,
    canCancel: (role === "owner" || role === "admin") && isCancellable(b.status),
    isOwner: role === "owner",
    viewerRole: role,
    events: b.events.map((e) => ({ state: e.state, at: e.at, byRole: e.byRole, note: role === "shared" ? null : e.note })),
    lastLocation: live ? b.lastLocation : null,
    etaMinutes: fresh ? (b.etaMinutes ?? straightLineEstimate(b.lastLocation!, b.pickup).etaMinutes) : null,
    searchingTimeoutAt: b.status === "Searching" && b.searchingSince ? new Date(new Date(b.searchingSince).getTime() + SEARCHING_TIMEOUT_MS).toISOString() : null,
    failureReason: b.failureReason,
    createdAt: b.createdAt,
  };
}

async function viewFor(ctx: Ctx, id: string) {
  return buildView(ctx.store, await loadBooking(ctx.store, id), ctx.user, ctx.now);
}

/** GET /bookings/:id — owner, assigned crew, destination hospital, admin, or a valid share token. */
export async function getBooking(ctx: Ctx, id: string, shareToken?: string) {
  let b = await loadBooking(ctx.store, id);
  const allowedByShare =
    !!shareToken && !!b.shareToken && !!b.shareExpiresAt && new Date(b.shareExpiresAt) > ctx.now && safeEqual(shareToken, b.shareToken);
  if (!allowedByShare && !can(ctx.user, "booking.read", b as unknown as Record<string, unknown>)) {
    if (!ctx.user) throw new AppError("UNAUTHENTICATED", "Sign in required");
    throw forbidden();
  }
  b = await tickBooking(ctx, b);
  return buildView(ctx.store, b, allowedByShare && !can(ctx.user, "booking.read", b as unknown as Record<string, unknown>) ? null : ctx.user, ctx.now);
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function listMyBookings(ctx: Ctx) {
  const docs = await ctx.store.query<BookingDoc>(C.bookings, { where: [["patientUid", "==", ctx.user!.uid]], orderBy: [["createdAt", "desc"]], limit: 20 });
  return { items: await Promise.all(docs.map((b) => buildView(ctx.store, b, ctx.user, ctx.now))) };
}

export async function releaseAmbulance(tx: Tx, b: BookingDoc) {
  if (!b.ambulanceId) return;
  const amb = await tx.get<AmbulanceDoc>(C.ambulances, b.ambulanceId);
  if (amb && amb.currentBookingId === b.id) tx.update(C.ambulances, amb.id, { status: "available", currentBookingId: null });
}

export async function cancelBooking(ctx: Ctx, id: string, reason?: string) {
  const b = await ctx.store.transaction(async (tx) => {
    const b = await tx.get<BookingDoc>(C.bookings, id);
    if (!b) throw notFound("Booking");
    if (!can(ctx.user, "booking.cancel", b as unknown as Record<string, unknown>)) throw forbidden();
    if (!isCancellable(b.status)) throw conflict("This booking can no longer be cancelled", [{ path: "status", issue: b.status }]);
    const amb = b.ambulanceId ? await tx.get<AmbulanceDoc>(C.ambulances, b.ambulanceId) : null;
    pushEvent(b, "Cancelled", ctx.now.toISOString(), ctx.user!.uid, ctx.user!.role === "super_admin" ? "system" : "patient", reason ?? null);
    if (amb && amb.currentBookingId === b.id) tx.update(C.ambulances, amb.id, { status: "available", currentBookingId: null });
    tx.set(C.bookings, b.id, b);
    return b;
  });
  return buildView(ctx.store, b, ctx.user, ctx.now);
}

export async function createShareLink(ctx: Ctx, id: string, origin: string) {
  const b = await loadBooking(ctx.store, id);
  if (!can(ctx.user, "booking.share", b as unknown as Record<string, unknown>)) throw forbidden();
  if ((TERMINAL_STATUSES as BookingStatus[]).includes(b.status)) throw ruleViolation("Trip has ended", [{ path: "status", issue: "terminal" }]);
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(ctx.now.getTime() + SHARE_LINK_TTL_MS).toISOString();
  await ctx.store.update(C.bookings, id, { shareToken: token, shareExpiresAt: expiresAt, updatedAt: ctx.now.toISOString() });
  return { url: `${origin}/bookings/${id}?t=${token}`, expiresAt };
}
