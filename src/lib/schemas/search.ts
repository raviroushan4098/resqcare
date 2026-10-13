import { z } from "zod";
import { CategorySchema, IsoDateSchema, SafeText, TierSchema } from "./common";
import { CapabilitySchema } from "./hospital";
import { LIMITS } from "../constants";

export const SearchRequestSchema = z.object({
  category: CategorySchema,
  text: SafeText(0, LIMITS.symptomsMax).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  locationSource: z.enum(["gps", "manual"]).default("manual"),
  radiusKm: z.number().positive().max(100),
  locale: z.enum(["en", "hi"]).default("en"),
});
export type SearchRequest = z.input<typeof SearchRequestSchema>;

/**
 * Structured explanation items. The UI renders these with i18n; the server
 * builds them from stored facts only, never from AI output.
 */
export const ReasonSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("has_capability"), capability: CapabilitySchema, tier: TierSchema }),
  z.object({ code: z.literal("beds_available"), kind: z.enum(["icu", "emergency", "ventilator"]), count: z.number(), tier: TierSchema }),
  z.object({ code: z.literal("closest"), distanceKm: z.number() }),
  z.object({ code: z.literal("specialist_on_duty") }),
  z.object({ code: z.literal("open_24x7") }),
  z.object({ code: z.literal("capability_not_recent"), capability: CapabilitySchema }),
  z.object({ code: z.literal("availability_stale") }),
  z.object({ code: z.literal("availability_unknown") }),
]);
export type Reason = z.infer<typeof ReasonSchema>;

export const SearchResultSchema = z.object({
  hospitalId: z.string(),
  name: z.string(),
  rank: z.number().int().positive(),
  score: z.number(),
  verification: z.enum(["approved", "pending", "unverified"]),
  distanceKm: z.number().min(0),
  etaMinutes: z.number().min(0).nullable(),
  etaIsEstimate: z.literal(true),
  facilities: z.array(z.object({ capability: CapabilitySchema, tier: TierSchema, verifiedAt: IsoDateSchema.nullable() })),
  availability: z.object({
    icuBeds: z.number().int().min(0).nullable(),
    emergencyBeds: z.number().int().min(0).nullable(),
    ventilators: z.number().int().min(0).nullable(),
    tier: TierSchema,
    updatedAt: IsoDateSchema.nullable(),
  }),
  matchedBecause: z.array(ReasonSchema),
  unconfirmed: z.array(ReasonSchema),
  phone: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const NearestHospitalSchema = z.object({
  hospitalId: z.string(),
  name: z.string(),
  phone: z.string(),
  distanceKm: z.number(),
});
export type NearestHospital = z.infer<typeof NearestHospitalSchema>;

export const SearchResponseSchema = z.object({
  intent: z.object({
    category: CategorySchema,
    requiredCapabilities: z.array(CapabilitySchema),
    preferredCapabilities: z.array(CapabilitySchema),
    source: z.enum(["ai", "rule"]),
  }),
  results: z.array(SearchResultSchema),
  noConfidentMatch: z.boolean(),
  nearest: z.array(NearestHospitalSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const EmergencyRequestCreateSchema = z.object({
  hospitalId: z.string(),
  category: CategorySchema,
  lat: z.number(),
  lng: z.number(),
  etaMinutes: z.number().nullable(),
  consent: z.object({ location: z.literal(true), shareDetails: z.literal(true) }),
  contact: z
    .object({ name: SafeText(1, 60).optional(), phone: z.string().max(20).optional() })
    .optional(),
});
export type EmergencyRequestCreate = z.infer<typeof EmergencyRequestCreateSchema>;
