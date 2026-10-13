import type { Capability, ProfilePatch, StaffPermission } from "@/lib/schemas";
import { authorize, can } from "../auth/policies";
import { availabilityTier, facilityTier } from "../domain/confidence";
import { geohash } from "../domain/geo";
import { conflict, notFound } from "../errors/AppError";
import type { Ctx } from "../http/router";
import {
  C,
  type AvailabilityDoc,
  type DepartmentDoc,
  type EmergencyRequestDoc,
  type FacilityDoc,
  type HospitalDoc,
  type SpecialistDoc,
  type UserDoc,
  type VerificationDoc,
} from "../repositories/collections";
import { audit, listAudit } from "./auditService";
import { getConfig } from "./configService";
import { invalidateHospitalCache } from "./hospitalService";
import { storeDocument } from "./storageService";

function hospitalOf(ctx: Ctx) {
  authorize(ctx.user, "hospital.portal.read");
  return ctx.user.hospitalId!;
}

async function loadHospital(ctx: Ctx, id: string) {
  const h = await ctx.store.get<HospitalDoc>(C.hospitals, id);
  if (!h) throw notFound("Hospital");
  return h;
}

/** Dashboard: verification, completeness checklist, freshness alert, request counter. */
export async function dashboard(ctx: Ctx) {
  const hospitalId = hospitalOf(ctx);
  const cfg = await getConfig(ctx.store);
  const [h, facilities, departments, availability, openRequests, verifications] = await Promise.all([
    loadHospital(ctx, hospitalId),
    ctx.store.query<FacilityDoc>(C.facilities, { where: [["hospitalId", "==", hospitalId]] }),
    ctx.store.query<DepartmentDoc>(C.departments, { where: [["hospitalId", "==", hospitalId]] }),
    ctx.store.get<AvailabilityDoc>(C.availability, hospitalId),
    ctx.store.count(C.emergencyRequests, { where: [["hospitalId", "==", hospitalId], ["status", "==", "new"]] }),
    ctx.store.query<VerificationDoc>(C.verifications, { where: [["hospitalId", "==", hospitalId]], orderBy: [["submittedAt", "desc"]], limit: 1 }),
  ]);
  const isAdmin = can(ctx.user, "hospital.staff.manage", { hospitalId });
  const latest = verifications[0] ?? null;
  return {
    hospital: { id: h.id, name: h.name, verificationStatus: h.verificationStatus, verifiedAt: h.verifiedAt },
    verification: latest
      ? { status: latest.decision, submittedAt: latest.submittedAt, reason: latest.reason, documentCount: latest.documents.length }
      : { status: h.verificationStatus === "approved" ? "approve" : "not_submitted", submittedAt: null, reason: null, documentCount: 0 },
    checklist: [
      { key: "address", done: h.address.length > 5, href: "/hospital/dashboard#profile" },
      { key: "coordinates", done: Boolean(h.location.lat && h.location.lng), href: "/hospital/dashboard#profile" },
      { key: "hours", done: Boolean(h.operatingHours && h.emergencyHours), href: "/hospital/dashboard#profile" },
      { key: "facilities", done: facilities.filter((f) => f.present).length >= 3, href: "/hospital/dashboard#facilities" },
      { key: "departments", done: departments.length > 0, href: "/hospital/dashboard#departments" },
    ],
    availability: {
      updatedAt: availability?.reportedAt ?? null,
      tier: availabilityTier(availability?.reportedAt ?? null, cfg.freshness.availabilityMinutes, ctx.now),
      freshnessMinutes: cfg.freshness.availabilityMinutes,
    },
    openRequests,
    permissions: {
      isAdmin,
      canUpdateAvailability: can(ctx.user, "hospital.availability.update", { hospitalId }),
      canRespond: can(ctx.user, "emergencyRequest.respond", { hospitalId }),
    },
  };
}

export async function getProfile(ctx: Ctx) {
  const hospitalId = hospitalOf(ctx);
  const h = await loadHospital(ctx, hospitalId);
  return {
    id: h.id, name: h.name, address: h.address, city: h.city, lat: h.location.lat, lng: h.location.lng, phone: h.phones[0] ?? "",
    operatingHours: h.operatingHours, emergencyHours: h.emergencyHours, emergency24x7: h.emergency24x7, verificationStatus: h.verificationStatus,
  };
}

export async function patchProfile(ctx: Ctx, patch: ProfilePatch) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.profile.update", { hospitalId });
  const before = await loadHospital(ctx, hospitalId);
  const update: Record<string, unknown> = { updatedAt: ctx.now.toISOString() };
  for (const k of ["name", "address", "city", "operatingHours", "emergencyHours", "emergency24x7"] as const) if (patch[k] !== undefined) update[k] = patch[k];
  if (patch.phone) update.phones = [patch.phone];
  if (patch.lat !== undefined && patch.lng !== undefined) update.location = { lat: patch.lat, lng: patch.lng, geohash: geohash(patch.lat, patch.lng) };
  await ctx.store.update(C.hospitals, hospitalId, update);
  invalidateHospitalCache();
  await audit(ctx, { action: "hospital.profile.update", resourceType: "hospital", resourceId: hospitalId, hospitalId, before: { name: before.name, address: before.address, location: before.location }, after: update });
  return getProfile(ctx);
}

export async function listFacilities(ctx: Ctx) {
  const hospitalId = hospitalOf(ctx);
  const cfg = await getConfig(ctx.store);
  const docs = await ctx.store.query<FacilityDoc>(C.facilities, { where: [["hospitalId", "==", hospitalId]] });
  return {
    items: docs.map((f) => ({ capability: f.capability, present: f.present, confirmed: f.confirmed, lastVerifiedAt: f.lastVerifiedAt, tier: facilityTier(f, cfg.freshness.facilityDays, ctx.now), notes: f.notes })),
    canManage: can(ctx.user, "hospital.facilities.manage", { hospitalId }),
  };
}

/**
 * Hospitals can declare a capability, but that makes it "Reported" only;
 * "Confirmed" needs admin or document verification.
 */
export async function upsertFacility(ctx: Ctx, input: { capability: Capability; present: boolean; notes?: string }) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.facilities.manage", { hospitalId });
  const id = `${hospitalId}_${input.capability}`;
  const before = await ctx.store.get<FacilityDoc>(C.facilities, id);
  const at = ctx.now.toISOString();
  const doc: FacilityDoc = {
    id, hospitalId, capability: input.capability, present: input.present,
    confirmed: false, lastVerifiedAt: input.present ? at : null, verifiedBy: null,
    source: "hospital", notes: input.notes ?? null, createdAt: before?.createdAt ?? at, updatedAt: at,
  };
  await ctx.store.set(C.facilities, id, doc);
  invalidateHospitalCache();
  await audit(ctx, { action: "facility.upsert", resourceType: "facility", resourceId: id, hospitalId, before, after: doc });
  return doc;
}

export async function deleteFacility(ctx: Ctx, capability: string) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.facilities.manage", { hospitalId });
  const id = `${hospitalId}_${capability}`;
  const before = await ctx.store.get<FacilityDoc>(C.facilities, id);
  if (!before) throw notFound("Facility");
  await ctx.store.delete(C.facilities, id);
  invalidateHospitalCache();
  await audit(ctx, { action: "facility.delete", resourceType: "facility", resourceId: id, hospitalId, before });
  return { deleted: true };
}

type Kind = "departments" | "specialists";
const pathOf = (k: Kind) => (k === "departments" ? C.departments : C.specialists);

export async function listStaffRecords(ctx: Ctx, kind: Kind) {
  const hospitalId = hospitalOf(ctx);
  const items = await ctx.store.query<DepartmentDoc | SpecialistDoc>(pathOf(kind), { where: [["hospitalId", "==", hospitalId]] });
  return { items, canManage: can(ctx.user, "hospital.facilities.manage", { hospitalId }) };
}

export async function createRecord(ctx: Ctx, kind: Kind, input: { name: string; specialty?: string; onDuty?: boolean }) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.facilities.manage", { hospitalId });
  const id = ctx.store.newId(kind === "departments" ? "dep_" : "doc_");
  const at = ctx.now.toISOString();
  const doc = kind === "departments"
    ? ({ id, hospitalId, name: input.name, confirmed: false, lastVerifiedAt: null, createdAt: at, updatedAt: at } satisfies DepartmentDoc)
    : ({ id, hospitalId, name: input.name, specialty: input.specialty ?? "", onDuty: input.onDuty ?? false, confirmed: false, lastVerifiedAt: null, createdAt: at, updatedAt: at } satisfies SpecialistDoc);
  await ctx.store.set(pathOf(kind), id, doc);
  await audit(ctx, { action: `${kind}.create`, resourceType: kind, resourceId: id, hospitalId, after: doc });
  return doc;
}

export async function updateRecord(ctx: Ctx, kind: Kind, id: string, patch: { name?: string; specialty?: string; onDuty?: boolean }) {
  const hospitalId = hospitalOf(ctx);
  // Duty status is operational; staff with availability permission may toggle it.
  const dutyOnly = kind === "specialists" && Object.keys(patch).every((k) => k === "onDuty");
  authorize(ctx.user, dutyOnly ? "hospital.availability.update" : "hospital.facilities.manage", { hospitalId });
  const before = await ctx.store.get<DepartmentDoc | SpecialistDoc>(pathOf(kind), id);
  if (!before || before.hospitalId !== hospitalId) throw notFound("Record");
  await ctx.store.update(pathOf(kind), id, { ...patch, updatedAt: ctx.now.toISOString() });
  await audit(ctx, { action: `${kind}.update`, resourceType: kind, resourceId: id, hospitalId, before, after: patch });
  return { ...before, ...patch };
}

export async function deleteRecord(ctx: Ctx, kind: Kind, id: string) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.facilities.manage", { hospitalId });
  const before = await ctx.store.get<DepartmentDoc | SpecialistDoc>(pathOf(kind), id);
  if (!before || before.hospitalId !== hospitalId) throw notFound("Record");
  await ctx.store.delete(pathOf(kind), id);
  await audit(ctx, { action: `${kind}.delete`, resourceType: kind, resourceId: id, hospitalId, before });
  return { deleted: true };
}

export async function listStaff(ctx: Ctx) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.staff.manage", { hospitalId });
  const users = await ctx.store.query<UserDoc>(C.users, { where: [["hospitalId", "==", hospitalId]] });
  return { items: users.map((u) => ({ id: u.id, displayName: u.displayName, email: u.email, role: u.role, permissions: u.permissions, status: u.status })) };
}

export async function inviteStaff(ctx: Ctx, input: { email: string; displayName: string; permissions: StaffPermission[] }) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.staff.manage", { hospitalId });
  const existing = await ctx.store.query<UserDoc>(C.users, { where: [["email", "==", input.email]] });
  if (existing.length) throw conflict("A user with this email already exists", [{ path: "email", issue: "duplicate" }]);
  const id = ctx.store.newId("u_inv_");
  const at = ctx.now.toISOString();
  const doc: UserDoc = { id, displayName: input.displayName, email: input.email, phone: null, role: "hospital_staff", hospitalId, providerId: null, permissions: input.permissions, locale: "en", status: "invited", consentAt: null, lastLoginAt: null, createdAt: at, updatedAt: at };
  await ctx.store.set(C.users, id, doc);
  await audit(ctx, { action: "staff.invite", resourceType: "user", resourceId: id, hospitalId, after: { email: input.email, permissions: input.permissions } });
  return { id, displayName: doc.displayName, email: doc.email, role: doc.role, permissions: doc.permissions, status: doc.status };
}

export async function patchStaff(ctx: Ctx, id: string, patch: { permissions?: StaffPermission[]; status?: "active" | "disabled" }) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.staff.manage", { hospitalId });
  const u = await ctx.store.get<UserDoc>(C.users, id);
  if (!u || u.hospitalId !== hospitalId || u.role !== "hospital_staff") throw notFound("Staff member");
  await ctx.store.update(C.users, id, { ...patch, updatedAt: ctx.now.toISOString() });
  await audit(ctx, { action: "staff.update", resourceType: "user", resourceId: id, hospitalId, before: { permissions: u.permissions, status: u.status }, after: patch });
  return { id, ...patch };
}

export async function hospitalAudit(ctx: Ctx) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.audit.read", { hospitalId });
  return { items: await listAudit(ctx, { hospitalId, limit: 30 }) };
}

export async function submitVerification(ctx: Ctx, input: { documents: { name: string; contentType: string; dataUrl: string }[] }) {
  const hospitalId = hospitalOf(ctx);
  authorize(ctx.user, "hospital.verification.submit", { hospitalId });
  const id = ctx.store.newId("v_");
  const documents = await Promise.all(input.documents.map((d) => storeDocument(hospitalId, id, d)));
  const h = await loadHospital(ctx, hospitalId);
  const doc: VerificationDoc = { id, hospitalId, submittedAt: ctx.now.toISOString(), submittedBy: ctx.user!.uid, documents, checklist: null, decision: "pending", reason: null, decidedBy: null, decidedAt: null };
  await ctx.store.set(C.verifications, id, doc);
  if (h.verificationStatus !== "approved") await ctx.store.update(C.hospitals, hospitalId, { verificationStatus: "pending", updatedAt: ctx.now.toISOString() });
  invalidateHospitalCache();
  await audit(ctx, { action: "verification.submit", resourceType: "hospitalVerification", resourceId: id, hospitalId, after: { documents: documents.map((d) => d.name) } });
  return { id, status: "pending" };
}

export async function requestCounter(ctx: Ctx) {
  const hospitalId = hospitalOf(ctx);
  const open = await ctx.store.query<EmergencyRequestDoc>(C.emergencyRequests, { where: [["hospitalId", "==", hospitalId], ["status", "==", "new"]] });
  return { open: open.length };
}
