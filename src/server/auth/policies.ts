import type { StaffPermission } from "@/lib/schemas";
import { forbidden, unauthenticated } from "../errors/AppError";
import type { AuthUser } from "./roles";

/**
 * The single place authorization is decided (Part C.3). Route handlers and
 * services call `authorize(user, action, resource)`; nothing checks roles inline.
 */
type Res = Record<string, unknown> | undefined;
type Rule = (u: AuthUser, r: Res) => boolean;

const sameHospital = (u: AuthUser, r: Res) => !!u.hospitalId && u.hospitalId === (r?.hospitalId ?? u.hospitalId);
const sameProvider = (u: AuthUser, r: Res) => !!u.providerId && u.providerId === (r?.providerId ?? u.providerId);
const hasPerm = (u: AuthUser, p: StaffPermission) => u.role === "hospital_admin" || u.permissions.includes(p);
const isAdmin = (u: AuthUser) => u.role === "super_admin";
const isHospital = (u: AuthUser) => u.role === "hospital_admin" || u.role === "hospital_staff";

const RULES = {
  // Patients and bookings
  "booking.create": (u) => u.role === "patient",
  "booking.list": (u) => u.role === "patient",
  "booking.read": (u, r) =>
    isAdmin(u) ||
    r?.patientUid === u.uid ||
    (u.role === "dispatcher" && !!u.providerId && (r?.providerId === u.providerId || (r?.candidateProviderIds as string[] | undefined)?.includes(u.providerId))) ||
    (u.role === "driver" && r?.driverId === u.uid) ||
    (isHospital(u) && !!u.hospitalId && r?.destinationHospitalId === u.hospitalId),
  "booking.cancel": (u, r) => r?.patientUid === u.uid || isAdmin(u),
  "booking.share": (u, r) => r?.patientUid === u.uid,
  "booking.viewContact": (u, r) =>
    r?.patientUid === u.uid || isAdmin(u) || (u.role === "driver" && r?.driverId === u.uid) || (u.role === "dispatcher" && r?.providerId === u.providerId),

  // Emergency requests shared with a hospital
  "emergencyRequest.create": () => true,
  "emergencyRequest.read": (u, r) => r?.patientRef === u.uid || isAdmin(u) || (isHospital(u) && sameHospital(u, r)),
  "emergencyRequest.respond": (u, r) => isHospital(u) && sameHospital(u, r) && hasPerm(u, "respondRequests"),
  "emergencyRequest.viewContact": (u, r) => isHospital(u) && sameHospital(u, r) && hasPerm(u, "viewPatientContact"),

  // Hospital portal
  "hospital.portal.read": (u, r) => isHospital(u) && sameHospital(u, r),
  "hospital.profile.update": (u, r) => u.role === "hospital_admin" && sameHospital(u, r),
  "hospital.verification.submit": (u, r) => u.role === "hospital_admin" && sameHospital(u, r),
  "hospital.facilities.manage": (u, r) => u.role === "hospital_admin" && sameHospital(u, r),
  "hospital.staff.manage": (u, r) => u.role === "hospital_admin" && sameHospital(u, r),
  "hospital.audit.read": (u, r) => u.role === "hospital_admin" && sameHospital(u, r),
  "hospital.availability.update": (u, r) => isHospital(u) && sameHospital(u, r) && hasPerm(u, "updateAvailability"),
  "hospital.review.respond": (u, r) => u.role === "hospital_admin" && sameHospital(u, r),

  // Ambulance provider and driver
  "provider.read": (u, r) => (u.role === "dispatcher" && sameProvider(u, r)) || isAdmin(u),
  "provider.dispatch": (u, r) => u.role === "dispatcher" && sameProvider(u, r),
  "provider.fleet.manage": (u, r) => u.role === "dispatcher" && sameProvider(u, r),
  "driver.assignment.read": (u) => u.role === "driver",
  "driver.booking.advance": (u, r) => u.role === "driver" && r?.driverId === u.uid,
  "driver.location.write": (u, r) => u.role === "driver" && r?.driverId === u.uid,

  // Reviews
  "review.create": (u) => u.role === "patient" && !u.isGuest,
  "review.report": () => true,

  // Self
  "me.read": () => true,
  "me.update": () => true,
  "auth.apply": (u) => u.role === "patient" && !u.isGuest,

  // Admin
  "admin.access": (u) => isAdmin(u),
} satisfies Record<string, Rule>;

export type Action = keyof typeof RULES;

export function can(user: AuthUser | null, action: Action, resource?: Res): boolean {
  if (!user) return false;
  return RULES[action](user, resource);
}

/** Throws 401 for anonymous callers and 403 when the policy denies. */
export function authorize(user: AuthUser | null, action: Action, resource?: Res): asserts user is AuthUser {
  if (!user) throw unauthenticated();
  if (!RULES[action](user, resource)) throw forbidden();
}
