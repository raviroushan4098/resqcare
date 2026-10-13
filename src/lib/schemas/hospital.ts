import { z } from "zod";
import { IsoDateSchema, TierSchema, VerificationStateSchema } from "./common";

export const CapabilitySchema = z.enum([
  "emergency_24x7",
  "cath_lab",
  "ct_scan",
  "mri",
  "stroke_unit",
  "trauma_center",
  "icu",
  "ventilator",
  "blood_bank",
  "burn_unit",
  "nicu",
  "dialysis",
]);
export type Capability = z.infer<typeof CapabilitySchema>;
export const CAPABILITIES = CapabilitySchema.options;

export const FacilityViewSchema = z.object({
  capability: CapabilitySchema,
  tier: TierSchema,
  verifiedAt: IsoDateSchema.nullable(),
});
export type FacilityView = z.infer<typeof FacilityViewSchema>;

const count = z.number().int().min(0).nullable();

/** Public availability. A null count means "unknown", never zero. */
export const AvailabilityViewSchema = z.object({
  icuBeds: count,
  icuTotal: count,
  emergencyBeds: count,
  emergencyTotal: count,
  ventilators: count,
  ventilatorsTotal: count,
  servicesNow: z
    .object({ ct: z.boolean().nullable(), cathLab: z.boolean().nullable(), specialistOnDuty: z.boolean().nullable() })
    .nullable(),
  tier: TierSchema,
  updatedAt: IsoDateSchema.nullable(),
  source: z.enum(["hospital", "admin", "seed"]).nullable(),
});
export type AvailabilityView = z.infer<typeof AvailabilityViewSchema>;

export const HospitalSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  verification: VerificationStateSchema,
  verifiedAt: IsoDateSchema.nullable(),
  address: z.string(),
  city: z.string(),
  lat: z.number(),
  lng: z.number(),
  phone: z.string(),
  emergency24x7: z.boolean(),
  specialties: z.array(z.string()),
  facilities: z.array(FacilityViewSchema),
  availability: AvailabilityViewSchema,
  distanceKm: z.number().nullable(),
  isFictional: z.boolean(),
});
export type HospitalSummary = z.infer<typeof HospitalSummarySchema>;

export const HospitalDetailSchema = HospitalSummarySchema.extend({
  operatingHours: z.string(),
  emergencyHours: z.string(),
  departments: z.array(z.object({ id: z.string(), name: z.string(), verifiedAt: IsoDateSchema.nullable() })),
  specialists: z.array(
    z.object({ id: z.string(), name: z.string(), specialty: z.string(), onDuty: z.boolean().nullable() }),
  ),
  ratingSummary: z.object({ average: z.number().min(0).max(5).nullable(), count: z.number().int().min(0) }),
});
export type HospitalDetail = z.infer<typeof HospitalDetailSchema>;

export const HospitalListResponseSchema = z.object({ items: z.array(HospitalSummarySchema), total: z.number() });

export const FlagSchema = z.object({
  field: z.enum(["availability", "facilities", "contact", "address", "hours", "other"]),
  description: z.string().trim().min(5).max(500),
});
export type FlagInput = z.infer<typeof FlagSchema>;

const bedCount = z.object({ available: z.number().int().min(0), total: z.number().int().min(0) }).refine(
  (v) => v.available <= v.total,
  { message: "exceeds_capacity", path: ["available"] },
);

export const AvailabilityUpdateSchema = z.object({
  icuBeds: bedCount,
  emergencyBeds: bedCount,
  ventilators: bedCount,
  servicesNow: z.object({ ct: z.boolean(), cathLab: z.boolean(), specialistOnDuty: z.boolean() }),
  /** Version the editor started from; a mismatch returns 409 with the latest values. */
  expectedVersion: z.number().int().min(0),
});
export type AvailabilityUpdate = z.infer<typeof AvailabilityUpdateSchema>;

export interface PortalAvailability {
  icuBeds: { available: number; total: number };
  emergencyBeds: { available: number; total: number };
  ventilators: { available: number; total: number };
  servicesNow: { ct: boolean; cathLab: boolean; specialistOnDuty: boolean };
  updatedAt: string | null;
  updatedByName: string | null;
  version: number;
  tier: z.infer<typeof TierSchema>;
}

export const ProfilePatchSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    address: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(60),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    phone: z.string().trim().min(6).max(20),
    operatingHours: z.string().trim().max(80),
    emergencyHours: z.string().trim().max(80),
    emergency24x7: z.boolean(),
  })
  .partial();
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

export const FacilityUpsertSchema = z.object({
  capability: CapabilitySchema,
  present: z.boolean(),
  notes: z.string().trim().max(200).optional(),
});
