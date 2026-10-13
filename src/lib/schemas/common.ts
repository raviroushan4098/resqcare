import { z } from "zod";

export const RoleSchema = z.enum([
  "patient",
  "hospital_admin",
  "hospital_staff",
  "dispatcher",
  "driver",
  "super_admin",
]);
export type Role = z.infer<typeof RoleSchema>;

export const TierSchema = z.enum(["confirmed", "reported", "unknown"]);
export type Tier = z.infer<typeof TierSchema>;

export const CategorySchema = z.enum(["cardiac", "stroke", "accident", "breathing", "trauma", "other"]);
export type Category = z.infer<typeof CategorySchema>;
export const CATEGORIES = CategorySchema.options;

export const BookingStatusSchema = z.enum([
  "Requested",
  "Searching",
  "Accepted",
  "Assigned",
  "EnRoute",
  "Arrived",
  "Completed",
  "Cancelled",
  "Rejected",
  "TimedOut",
  "Failed",
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const TERMINAL_STATUSES: readonly BookingStatus[] = ["Completed", "Cancelled", "Rejected", "TimedOut", "Failed"];
export const HAPPY_PATH: readonly BookingStatus[] = [
  "Requested",
  "Searching",
  "Accepted",
  "Assigned",
  "EnRoute",
  "Arrived",
  "Completed",
];

export const VerificationStateSchema = z.enum(["unverified", "pending", "approved", "rejected", "suspended"]);
export type VerificationState = z.infer<typeof VerificationStateSchema>;

export const AmbulanceTypeSchema = z.enum(["basic", "als"]);
export type AmbulanceType = z.infer<typeof AmbulanceTypeSchema>;

/** Error codes the backend returns (Part C.5). */
export const ErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RULE_VIOLATION",
  "RATE_LIMITED",
  "UPSTREAM_FAILED",
  "UPSTREAM_TIMEOUT",
  "INTERNAL",
]);
export type ServerErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * Codes the client raises itself: NETWORK_ERROR when fetch never got a
 * response, CONTRACT_MISMATCH when a response did not match its schema.
 */
export type ErrorCode = ServerErrorCode | "NETWORK_ERROR" | "CONTRACT_MISMATCH";

export const DegradedSchema = z.enum(["ai", "maps"]);
export type Degraded = z.infer<typeof DegradedSchema>;

export const MetaSchema = z.object({
  requestId: z.string(),
  degraded: z.array(DegradedSchema).optional(),
  nextCursor: z.string().nullable().optional(),
});
export type Meta = z.infer<typeof MetaSchema>;

export const ErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.array(z.object({ path: z.string(), issue: z.string() })).optional(),
});

export const ErrEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: ErrorBodySchema,
  meta: z.object({ requestId: z.string() }),
});
export type ErrEnvelope = z.infer<typeof ErrEnvelopeSchema>;

export const OkEnvelopeBaseSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
  meta: MetaSchema,
});

export type Ok<T> = { ok: true; data: T; meta: Meta };

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

export const IsoDateSchema = z.string().datetime({ offset: true });

/** Indian mobile number, stored as E.164 (+91XXXXXXXXXX). Spaces and dashes are stripped first. */
export const PhoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+91)?[6-9]\d{9}$/, "invalid_phone"))
  .transform((s) => (s.startsWith("+91") ? s : `+91${s}`));

/** Free text a user typed. Control characters removed; HTML is never rendered from it. */
export const SafeText = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min).max(max));
