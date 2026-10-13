import type { Role, StaffPermission } from "@/lib/schemas";

export interface AuthUser {
  uid: string;
  role: Role;
  hospitalId: string | null;
  providerId: string | null;
  permissions: StaffPermission[];
  displayName: string;
  /** Phone-verified guest without a full account. */
  isGuest: boolean;
}

export const HOSPITAL_ROLES: Role[] = ["hospital_admin", "hospital_staff"];
export const isHospitalUser = (u: AuthUser | null) => !!u && HOSPITAL_ROLES.includes(u.role);
