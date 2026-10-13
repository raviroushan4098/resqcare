import { z } from "zod";
import type { Role } from "./common";

export const STAFF_PERMISSIONS = ["updateAvailability", "respondRequests", "viewPatientContact"] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export interface Me {
  uid: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  hospitalId: string | null;
  providerId: string | null;
  permissions: StaffPermission[];
  locale: "en" | "hi";
}

export const SessionSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  locale: z.enum(["en", "hi"]).optional(),
  consent: z.boolean().optional(),
});

export const MePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  locale: z.enum(["en", "hi"]).optional(),
});

export const ApplySchema = z.object({
  type: z.enum(["hospital", "provider"]),
  orgName: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(60),
  registryRef: z.string().trim().min(3).max(60),
  contactPhone: z.string().trim().min(6).max(20),
});

export const StaffInviteSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(60),
  permissions: z.array(z.enum(STAFF_PERMISSIONS)),
});
export const StaffPatchSchema = z.object({
  permissions: z.array(z.enum(STAFF_PERMISSIONS)).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});
