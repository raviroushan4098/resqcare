import { z } from "zod";
import { AmbulanceTypeSchema, BookingStatusSchema, IsoDateSchema, PhoneSchema, Role, SafeText } from "./common";
import { LIMITS } from "../constants";

export const CreateBookingSchema = z.object({
  pickup: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: SafeText(0, 200).optional(),
    consent: z.literal(true),
  }),
  /** null = "nearest suitable hospital". */
  destinationHospitalId: z.string().nullable(),
  type: AmbulanceTypeSchema,
  contact: z.object({ name: SafeText(1, 60), phone: PhoneSchema }),
  patientCount: z.number().int().min(1).max(5).default(1),
  note: SafeText(0, LIMITS.bookingNoteMax).optional(),
});
export type CreateBookingInput = z.input<typeof CreateBookingSchema>;

export const CancelBookingSchema = z.object({ reason: SafeText(0, 200).optional() });

export interface BookingEvent {
  state: z.infer<typeof BookingStatusSchema>;
  at: string;
  byRole: Role | "system";
  note: string | null;
}

/** Booking as returned to a viewer; fields are filtered per viewer by the server. */
export interface BookingView {
  id: string;
  status: z.infer<typeof BookingStatusSchema>;
  demo: boolean;
  type: z.infer<typeof AmbulanceTypeSchema>;
  patientCount: number;
  pickup: { lat: number; lng: number; address: string | null };
  destination: { hospitalId: string; name: string; phone: string } | null;
  provider: { name: string; phone: string } | null;
  vehicle: { registration: string; type: z.infer<typeof AmbulanceTypeSchema> } | null;
  driver: { firstName: string; phoneMasked: string; phone: string | null } | null;
  /** Only present for the owner and assigned crew; masked otherwise. */
  contact: { name: string; phoneMasked: string; phone: string | null } | null;
  canRevealPhone: boolean;
  canCancel: boolean;
  isOwner: boolean;
  viewerRole: "owner" | "provider" | "driver" | "hospital" | "admin" | "shared";
  events: BookingEvent[];
  lastLocation: { lat: number; lng: number; at: string } | null;
  etaMinutes: number | null;
  searchingTimeoutAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export const ShareLinkResponseSchema = z.object({ url: z.string(), expiresAt: IsoDateSchema });

export const DriverStatusSchema = z.object({ status: z.enum(["EnRoute", "Arrived", "Completed"]) });

export const LocationBatchSchema = z.object({
  bookingId: z.string(),
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().min(0).max(5000).optional(),
        ts: IsoDateSchema,
      }),
    )
    .min(1)
    .max(60),
});
export type LocationBatch = z.infer<typeof LocationBatchSchema>;

export const AssignSchema = z.object({ ambulanceId: z.string(), driverId: z.string() });
export const RejectSchema = z.object({ reason: SafeText(3, 200) });
