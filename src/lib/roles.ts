import type { Role } from "./schemas";

/** Where each role lands after sign-in (client copy of the server map). */
export const HOME_FOR_ROLE: Record<Role, string> = {
  patient: "/emergency",
  hospital_admin: "/hospital/dashboard",
  hospital_staff: "/hospital/dashboard",
  dispatcher: "/ambulance/dashboard",
  driver: "/driver/dashboard",
  super_admin: "/admin/dashboard",
};

/** Seeded demo accounts for the role switcher (fictional). */
export const DEMO_ACCOUNTS: { uid: string; role: Role }[] = [
  { uid: "u_patient_demo", role: "patient" },
  { uid: "u_hadmin_demo", role: "hospital_admin" },
  { uid: "u_hstaff_demo", role: "hospital_staff" },
  { uid: "u_dispatch_demo", role: "dispatcher" },
  { uid: "u_driver_demo", role: "driver" },
  { uid: "u_admin_demo", role: "super_admin" },
];

/** Only allow same-origin relative return paths, never an open redirect. */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
