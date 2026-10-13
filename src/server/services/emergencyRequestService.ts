import type { EmergencyRequestCreate } from "@/lib/schemas";
import { PhoneSchema } from "@/lib/schemas";
import { maskPhone } from "@/lib/format";
import { authorize, can } from "../auth/policies";
import { notify } from "../adapters/notifier/inApp";
import { EMERGENCY_REQUEST_TTL_MS } from "../config/constants";
import { roundLocation } from "../domain/geo";
import { conflict, notFound, AppError } from "../errors/AppError";
import type { Ctx } from "../http/router";
import { C, type EmergencyRequestContactDoc, type EmergencyRequestDoc, type HospitalDoc, type UserDoc } from "../repositories/collections";
import { audit } from "./auditService";

/** Shares minimal details with one chosen hospital, only after explicit consent. Location is rounded. */
export async function createEmergencyRequest(ctx: Ctx, input: EmergencyRequestCreate) {
  const h = await ctx.store.get<HospitalDoc>(C.hospitals, input.hospitalId);
  if (!h || h.verificationStatus !== "approved") throw notFound("Hospital");
  const id = ctx.store.newId("er_");
  const at = ctx.now.toISOString();
  const expiresAt = new Date(ctx.now.getTime() + EMERGENCY_REQUEST_TTL_MS).toISOString();
  let phone: string | null = null;
  if (input.contact?.phone) {
    const p = PhoneSchema.safeParse(input.contact.phone);
    if (!p.success) throw new AppError("VALIDATION_FAILED", "Invalid phone", { details: [{ path: "contact.phone", issue: "invalid_phone" }] });
    phone = p.data;
  }
  const doc: EmergencyRequestDoc = {
    id,
    patientRef: ctx.user?.uid ?? `anon_${ctx.ipHash}`,
    category: input.category,
    locationRounded: roundLocation(input.lat, input.lng),
    hospitalId: h.id,
    etaMinutes: input.etaMinutes,
    status: "new",
    consent: { location: input.consent.location, shareDetails: input.consent.shareDetails },
    hasContact: Boolean(input.contact?.name || phone),
    declineReason: null,
    handledBy: null,
    handledByName: null,
    createdAt: at,
    updatedAt: at,
    expiresAt,
  };
  await ctx.store.set(C.emergencyRequests, id, doc);
  await ctx.store.set(C.emergencyRequestContacts, id, {
    id, hospitalId: h.id, name: input.contact?.name ?? null, phone, expiresAt,
  } satisfies EmergencyRequestContactDoc);
  const staff = await ctx.store.query<UserDoc>(C.users, { where: [["hospitalId", "==", h.id]] });
  for (const s of staff.filter((u) => u.status === "active")) {
    await notify(ctx.store, { userId: s.id, type: "request.new", title: "New incoming emergency", body: `Category: ${input.category}`, resourceRef: id }, ctx.now);
  }
  return { id, status: doc.status, hospitalName: h.name };
}

const URGENCY: Record<string, number> = { cardiac: 0, stroke: 0, breathing: 1, trauma: 1, accident: 2, other: 3 };

/** Requests addressed to the caller's hospital, newest and most urgent first. Contact only with permission. */
export async function listHospitalRequests(ctx: Ctx, status?: string) {
  authorize(ctx.user, "hospital.portal.read");
  const hospitalId = ctx.user.hospitalId!;
  const where: [string, "==" | "in", unknown][] = [["hospitalId", "==", hospitalId]];
  if (status === "open") where.push(["status", "in", ["new", "accepted"]]);
  else if (status) where.push(["status", "==", status]);
  const docs = await ctx.store.query<EmergencyRequestDoc>(C.emergencyRequests, { where, orderBy: [["createdAt", "desc"]], limit: 100 });
  const canContact = can(ctx.user, "emergencyRequest.viewContact", { hospitalId });
  const contacts = canContact
    ? new Map((await Promise.all(docs.map((d) => ctx.store.get<EmergencyRequestContactDoc>(C.emergencyRequestContacts, d.id)))).filter(Boolean).map((c) => [c!.id, c!]))
    : new Map<string, EmergencyRequestContactDoc>();
  const items = docs.map((d) => {
    const c = contacts.get(d.id);
    return {
      id: d.id,
      category: d.category,
      etaMinutes: d.etaMinutes,
      status: d.status,
      createdAt: d.createdAt,
      declineReason: d.declineReason,
      handledByName: d.handledByName,
      hasContact: d.hasContact,
      contact: canContact && c ? { name: c.name, phone: c.phone, phoneMasked: maskPhone(c.phone) } : null,
      contactMasked: d.hasContact ? (canContact ? null : "hidden") : null,
    };
  });
  items.sort((a, b) => {
    const open = (s: string) => (s === "new" ? 0 : s === "accepted" ? 1 : 2);
    return open(a.status) - open(b.status) || (URGENCY[a.category] ?? 9) - (URGENCY[b.category] ?? 9) || b.createdAt.localeCompare(a.createdAt);
  });
  return { items, canViewContact: canContact, canRespond: can(ctx.user, "emergencyRequest.respond", { hospitalId }) };
}

/** Accept, decline (reason required) or mark arrived. 409 if a colleague already handled it. */
export async function respondToRequest(ctx: Ctx, id: string, action: "accept" | "decline" | "arrived", reason?: string) {
  const updated = await ctx.store.transaction(async (tx) => {
    const d = await tx.get<EmergencyRequestDoc>(C.emergencyRequests, id);
    if (!d) throw notFound("Request");
    authorize(ctx.user, "emergencyRequest.respond", d as unknown as Record<string, unknown>);
    const allowed = action === "arrived" ? d.status === "accepted" : d.status === "new";
    if (!allowed) {
      throw conflict(d.handledByName ? `Already handled by ${d.handledByName}` : "Request already handled", [{ path: "status", issue: d.status }]);
    }
    if (action === "decline" && (!reason || reason.trim().length < 3)) {
      throw new AppError("VALIDATION_FAILED", "Reason required", { details: [{ path: "reason", issue: "required" }] });
    }
    const next = { accept: "accepted", decline: "declined", arrived: "arrived" }[action] as EmergencyRequestDoc["status"];
    const patch = { status: next, declineReason: action === "decline" ? reason!.trim() : d.declineReason, handledBy: ctx.user.uid, handledByName: ctx.user.displayName, updatedAt: ctx.now.toISOString() };
    tx.update(C.emergencyRequests, id, patch);
    return { ...d, ...patch };
  });
  await audit(ctx, { action: `emergencyRequest.${action}`, resourceType: "emergencyRequest", resourceId: id, hospitalId: updated.hospitalId, after: { status: updated.status } });
  return { id, status: updated.status };
}
