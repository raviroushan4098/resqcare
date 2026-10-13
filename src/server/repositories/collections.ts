/**
 * Firestore collection names and stored document shapes (Part E).
 * Every document carries its own `id`, plus createdAt/updatedAt as ISO strings
 * set by the server clock (never the device).
 */
import type {
  AmbulanceType,
  BookingStatus,
  Capability,
  Category,
  Role,
  StaffPermission,
  VerificationState,
} from "@/lib/schemas";

export const C = {
  users: "users",
  hospitals: "hospitals",
  facilities: "hospitalFacilities",
  availability: "hospitalAvailability",
  availabilityHistory: (hospitalId: string) => `hospitalAvailability/${hospitalId}/history`,
  departments: "departments",
  specialists: "specialists",
  providers: "ambulanceProviders",
  ambulances: "ambulances",
  bookings: "ambulanceBookings",
  locations: (bookingId: string) => `ambulanceBookings/${bookingId}/locations`,
  emergencyRequests: "emergencyRequests",
  emergencyRequestContacts: "emergencyRequestContacts",
  reviews: "reviews",
  reviewReports: "reviewReports",
  notifications: "notifications",
  verifications: "hospitalVerifications",
  auditLogs: "auditLogs",
  config: "systemConfiguration",
  searchLogs: "searchLogs",
  flags: "flags",
  idempotencyKeys: "idempotencyKeys",
  rateLimits: "rateLimits",
  applications: "applications",
} as const;

interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface UserDoc extends Timestamps {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  hospitalId: string | null;
  providerId: string | null;
  permissions: StaffPermission[];
  locale: "en" | "hi";
  status: "active" | "disabled" | "invited";
  consentAt: string | null;
  lastLoginAt: string | null;
  deletionRequestedAt?: string | null;
  /** Phone-verified guest (ambulance request without a full account). */
  isGuest?: boolean;
}

export interface HospitalDoc extends Timestamps {
  id: string;
  name: string;
  address: string;
  city: string;
  location: { lat: number; lng: number; geohash: string };
  phones: string[];
  operatingHours: string;
  emergencyHours: string;
  emergency24x7: boolean;
  specialties: string[];
  verificationStatus: VerificationState;
  verifiedAt: string | null;
  verifiedBy: string | null;
  registryRef: string | null;
  isFictional: boolean;
  ratingAverage: number | null;
  ratingCount: number;
}

export interface FacilityDoc extends Timestamps {
  id: string; // `${hospitalId}_${capability}`
  hospitalId: string;
  capability: Capability;
  /** Verified by an admin or document. false = claimed by the hospital only. */
  confirmed: boolean;
  /** Present on the hospital's record at all. false means "not available". */
  present: boolean;
  lastVerifiedAt: string | null;
  verifiedBy: string | null;
  source: "hospital" | "admin" | "document" | "seed";
  notes: string | null;
}

export interface BedCount {
  available: number;
  total: number;
}

export interface AvailabilityDoc extends Timestamps {
  id: string; // hospitalId
  hospitalId: string;
  icuBeds: BedCount | null;
  emergencyBeds: BedCount | null;
  ventilators: BedCount | null;
  servicesNow: { ct: boolean; cathLab: boolean; specialistOnDuty: boolean } | null;
  updatedAt: string;
  /** null until anyone has reported availability. */
  reportedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  source: "hospital" | "admin" | "seed";
  version: number;
  /** Set by the freshness sweep when reportedAt passes the window. */
  stale: boolean;
}

export interface AvailabilityHistoryDoc {
  id: string;
  hospitalId: string;
  icuBeds: BedCount | null;
  emergencyBeds: BedCount | null;
  ventilators: BedCount | null;
  servicesNow: AvailabilityDoc["servicesNow"];
  at: string;
  byName: string | null;
  expiresAt: string;
}

export interface DepartmentDoc extends Timestamps {
  id: string;
  hospitalId: string;
  name: string;
  confirmed: boolean;
  lastVerifiedAt: string | null;
}

export interface SpecialistDoc extends Timestamps {
  id: string;
  hospitalId: string;
  name: string;
  specialty: string;
  onDuty: boolean;
  confirmed: boolean;
  lastVerifiedAt: string | null;
}

export interface ProviderDoc extends Timestamps {
  id: string;
  name: string;
  contactPhone: string;
  serviceArea: { center: { lat: number; lng: number }; radiusKm: number };
  status: "pending" | "approved" | "rejected" | "suspended";
  isDemo: boolean;
  /** Demo providers with this flag accept and run trips automatically. */
  simulated: boolean;
  approvedAt: string | null;
  decisionReason: string | null;
  ownerUid: string | null;
}

export interface AmbulanceDoc extends Timestamps {
  id: string;
  providerId: string;
  registration: string;
  type: AmbulanceType;
  driverId: string | null;
  status: "available" | "busy" | "offline";
  currentBookingId: string | null;
  lastLocation: { lat: number; lng: number; at: string } | null;
}

export interface BookingDoc extends Timestamps {
  id: string;
  patientUid: string;
  idempotencyKey: string;
  status: BookingStatus;
  demo: boolean;
  type: AmbulanceType;
  patientCount: number;
  note: string | null;
  pickup: { lat: number; lng: number; address: string | null };
  destinationHospitalId: string | null;
  providerId: string | null;
  /** Providers whose queue this request appears in while Searching. */
  candidateProviderIds: string[];
  rejectedBy: string[];
  ambulanceId: string | null;
  driverId: string | null;
  contact: { name: string; phone: string };
  events: { state: BookingStatus; at: string; by: string; byRole: Role | "system"; note: string | null }[];
  shareToken: string | null;
  shareExpiresAt: string | null;
  searchingSince: string | null;
  lastLocation: { lat: number; lng: number; at: string } | null;
  etaMinutes: number | null;
  failureReason: string | null;
  /** Demo simulation: where the ambulance started. */
  simStart: { lat: number; lng: number } | null;
}

export interface LocationDoc {
  id: string;
  bookingId: string;
  driverId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  ts: string;
  expiresAt: string;
}

export interface EmergencyRequestDoc extends Timestamps {
  id: string;
  patientRef: string;
  category: Category;
  locationRounded: { lat: number; lng: number };
  hospitalId: string;
  etaMinutes: number | null;
  status: "new" | "accepted" | "declined" | "arrived" | "expired";
  consent: { location: boolean; shareDetails: boolean };
  hasContact: boolean;
  declineReason: string | null;
  handledBy: string | null;
  handledByName: string | null;
  expiresAt: string;
}

/** Contact details live apart so client-side reads of requests never include them. */
export interface EmergencyRequestContactDoc {
  id: string;
  hospitalId: string;
  name: string | null;
  phone: string | null;
  expiresAt: string;
}

export interface ReviewDoc extends Timestamps {
  id: string;
  hospitalId: string;
  authorUid: string;
  authorName: string;
  rating: number;
  text: string;
  visitDate: string | null;
  status: "pending" | "approved" | "rejected" | "removed";
  verifiedVisit: boolean;
  reportCount: number;
  response: { text: string; by: string; at: string } | null;
}

export interface NotificationDoc {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  resourceRef: string | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface VerificationDoc {
  id: string;
  hospitalId: string;
  submittedAt: string;
  submittedBy: string;
  documents: { name: string; path: string; contentType: string }[];
  checklist: Record<string, boolean> | null;
  decision: "pending" | "approve" | "reject" | "request_info" | "suspend";
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface AuditDoc {
  id: string;
  actorUid: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  /** Hospital the change concerns, for hospital-admin scoped reads. */
  hospitalId: string | null;
  before: unknown;
  after: unknown;
  ipHash: string | null;
  createdAt: string;
}

export interface SearchLogDoc {
  id: string;
  category: Category;
  latencyMs: number;
  resultCount: number;
  noConfidentMatch: boolean;
  degraded: string[];
  aiSource: "ai" | "rule";
  city: string;
  outcome: "ok" | "error";
  errorCause: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface FlagDoc {
  id: string;
  hospitalId: string;
  field: string;
  description: string;
  status: "open" | "resolved";
  resolution: string | null;
  resolvedBy: string | null;
  reporterHash: string | null;
  createdAt: string;
}

export interface IdempotencyDoc {
  id: string; // `${uid}_${key}`
  bookingId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ApplicationDoc extends Timestamps {
  id: string;
  uid: string;
  type: "hospital" | "provider";
  orgName: string;
  city: string;
  registryRef: string;
  contactPhone: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
}

export interface ReviewReportDoc {
  id: string;
  reviewId: string;
  reporterUid: string;
  reason: string;
  createdAt: string;
}
