import { SEARCHING_TIMEOUT_MS } from "../config/constants";
import type { Ctx } from "../http/router";
import { C, type AvailabilityDoc, type BookingDoc, type EmergencyRequestContactDoc, type EmergencyRequestDoc, type LocationDoc, type UserDoc } from "../repositories/collections";
import { pushEvent } from "../services/bookingService";
import { getConfig } from "../services/configService";
import { tickAll } from "../services/dispatchService";

type JobCtx = Pick<Ctx, "store" | "now" | "scenario">;

/** Marks availability past its window as stale (tier is computed on read; this feeds the admin queue). */
export async function freshnessSweep(ctx: JobCtx) {
  const cfg = await getConfig(ctx.store);
  const cutoff = new Date(ctx.now.getTime() - cfg.freshness.availabilityMinutes * 60_000).toISOString();
  const docs = await ctx.store.query<AvailabilityDoc>(C.availability, { where: [["stale", "==", false]] });
  let flagged = 0;
  for (const a of docs) {
    if (a.reportedAt && a.reportedAt < cutoff) {
      await ctx.store.update(C.availability, a.id, { stale: true });
      flagged++;
    }
  }
  return { checked: docs.length, flagged };
}

export const demoTicker = (ctx: JobCtx) => tickAll(ctx);

/** Searching bookings nobody accepted within the window become TimedOut. */
export async function bookingTimeout(ctx: JobCtx) {
  const cutoff = new Date(ctx.now.getTime() - SEARCHING_TIMEOUT_MS).toISOString();
  const docs = await ctx.store.query<BookingDoc>(C.bookings, { where: [["status", "==", "Searching"], ["searchingSince", "<", cutoff]] });
  for (const d of docs) {
    await ctx.store.transaction(async (tx) => {
      const b = await tx.get<BookingDoc>(C.bookings, d.id);
      if (!b || b.status !== "Searching") return;
      pushEvent(b, "TimedOut", ctx.now.toISOString(), "system", "system", "searching_timeout");
      tx.set(C.bookings, b.id, b);
    });
  }
  return { timedOut: docs.length };
}

/**
 * Deletes expired emergency requests and location points, redacts old booking
 * contacts (90 days) and anonymizes accounts 30 days after a deletion request.
 * Firestore TTL policies do the same in production; this covers the memory store
 * and acts as a backstop.
 */
export async function retentionCleanup(ctx: JobCtx) {
  const nowIso = ctx.now.toISOString();
  let deleted = 0;
  for (const path of [C.emergencyRequests, C.emergencyRequestContacts]) {
    const expired = await ctx.store.query<EmergencyRequestDoc | EmergencyRequestContactDoc>(path, { where: [["expiresAt", "<", nowIso]] });
    for (const e of expired) {
      await ctx.store.delete(path, e.id);
      deleted++;
    }
  }
  const dayAgo = new Date(ctx.now.getTime() - 24 * 3600_000).toISOString();
  const ended = await ctx.store.query<BookingDoc>(C.bookings, { where: [["status", "in", ["Completed", "Cancelled", "Failed"]], ["updatedAt", "<", dayAgo]] });
  for (const b of ended) {
    const points = await ctx.store.query<LocationDoc>(C.locations(b.id));
    for (const p of points) {
      await ctx.store.delete(C.locations(b.id), p.id);
      deleted++;
    }
  }
  const ninetyDaysAgo = new Date(ctx.now.getTime() - 90 * 86_400_000).toISOString();
  const old = await ctx.store.query<BookingDoc>(C.bookings, { where: [["createdAt", "<", ninetyDaysAgo]] });
  let redacted = 0;
  for (const b of old.filter((b) => b.contact.phone !== "redacted")) {
    await ctx.store.update(C.bookings, b.id, { contact: { name: "redacted", phone: "redacted" } });
    redacted++;
  }
  const thirtyDaysAgo = new Date(ctx.now.getTime() - 30 * 86_400_000).toISOString();
  const users = await ctx.store.query<UserDoc>(C.users, { where: [["deletionRequestedAt", "<", thirtyDaysAgo]] });
  for (const u of users) {
    await ctx.store.update(C.users, u.id, { displayName: "Deleted user", email: null, phone: null, status: "disabled", deletionRequestedAt: null });
  }
  return { deleted, redacted, anonymized: users.length };
}
