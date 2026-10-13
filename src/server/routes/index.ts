/**
 * API route table (Part D). One catch-all Next.js route handler dispatches here,
 * so every endpoint runs the same pipeline: scenario -> auth -> policy ->
 * rate limit -> validation -> service -> envelope.
 */
import { z } from "zod";
import {
  AdminConfigSchema,
  ApplySchema,
  AmbulanceTypeSchema,
  AssignSchema,
  AvailabilityUpdateSchema,
  CancelBookingSchema,
  CapabilitySchema,
  CreateBookingSchema,
  CreateReviewSchema,
  DemoSettingsSchema,
  DriverStatusSchema,
  EmergencyRequestCreateSchema,
  FacilityUpsertSchema,
  FlagSchema,
  LocationBatchSchema,
  MePatchSchema,
  ModerateReviewSchema,
  PhoneSchema,
  ProfilePatchSchema,
  ProviderDecisionSchema,
  RejectSchema,
  ReportReviewSchema,
  ResolveFlagSchema,
  ReviewResponseSchema,
  SearchRequestSchema,
  SessionSchema,
  SetRoleSchema,
  StaffInviteSchema,
  StaffPatchSchema,
  TierSchema,
  VerifyDecisionSchema,
} from "@/lib/schemas";
import { defineRoute as r, type RouteDef } from "../http/router";
import * as jobs from "../jobs";
import * as admin from "../services/adminService";
import * as availability from "../services/availabilityService";
import * as booking from "../services/bookingService";
import { getConfig, toAdminConfig, toPublicConfig, updateAdminConfig, updateDemoSettings } from "../services/configService";
import * as dispatch from "../services/dispatchService";
import * as driver from "../services/driverService";
import * as er from "../services/emergencyRequestService";
import * as hospitals from "../services/hospitalService";
import * as portal from "../services/hospitalPortalService";
import * as reviews from "../services/reviewService";
import { emergencySearch } from "../services/searchService";
import * as users from "../services/userService";

const num = z.coerce.number();
const optBool = z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true"));
const originQuery = z.object({ lat: num.optional(), lng: num.optional() });
const origin = (q: { lat?: number; lng?: number }) => (q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null);

const RecordSchema = z.object({ name: z.string().trim().min(2).max(80), specialty: z.string().trim().max(60).optional(), onDuty: z.boolean().optional() });
const RecordPatchSchema = RecordSchema.partial();
const kindOf = (p: string) => (p === "departments" ? "departments" : "specialists") as "departments" | "specialists";

export const routes: RouteDef[] = [
  // ---- Config and public ----------------------------------------------------
  r({ method: "GET", path: "/health", auth: "public", handler: async () => ({ status: "ok" }) }),
  r({ method: "GET", path: "/config/public", auth: "public", handler: async (c) => toPublicConfig(await getConfig(c.store, c.scenario)) }),

  // ---- Auth and users -------------------------------------------------------
  r({ method: "POST", path: "/auth/session", auth: "required", body: SessionSchema, handler: (c) => users.syncSession(c, c.body) }),
  r({ method: "POST", path: "/auth/apply", auth: "required", body: ApplySchema, rateLimit: { bucket: "apply", limit: 3, windowSec: 3600, by: "user" }, handler: (c) => users.applyForRole(c, c.body) }),
  r({ method: "GET", path: "/me", auth: "required", handler: (c) => users.getMe(c) }),
  r({ method: "PATCH", path: "/me", auth: "required", body: MePatchSchema, handler: (c) => users.patchMe(c, c.body) }),
  r({ method: "DELETE", path: "/me", auth: "required", handler: (c) => users.requestDeletion(c) }),

  // ---- Emergency search -----------------------------------------------------
  r({
    method: "POST", path: "/emergency/search", auth: "optional", body: SearchRequestSchema,
    rateLimit: { bucket: "search", limit: 30, windowSec: 60, by: "ip" },
    handler: (c) => emergencySearch(c, c.body),
  }),
  r({
    method: "POST", path: "/emergency/requests", auth: "optional", body: EmergencyRequestCreateSchema, status: 201,
    rateLimit: { bucket: "erequest", limit: 5, windowSec: 600, by: "ip" },
    handler: (c) => er.createEmergencyRequest(c, c.body),
  }),

  // ---- Hospitals (public) ---------------------------------------------------
  r({
    method: "GET", path: "/hospitals", auth: "public",
    query: z.object({
      q: z.string().max(80).optional(), city: z.string().max(60).optional(), specialty: z.string().max(60).optional(),
      emergency24x7: optBool, verified: optBool, confidence: TierSchema.optional(),
      lat: num.optional(), lng: num.optional(), radiusKm: num.optional(), cursor: z.string().max(10).optional(), limit: num.optional(),
    }),
    handler: async (c) => {
      const cfg = await getConfig(c.store, c.scenario);
      return hospitals.listHospitals(c, cfg, { ...c.query, verifiedOnly: c.query.verified });
    },
  }),
  r({
    method: "GET", path: "/hospitals/:id", auth: "public", query: originQuery,
    handler: async (c) => hospitals.getHospitalDetail(c, await getConfig(c.store, c.scenario), c.params.id!, origin(c.query)),
  }),
  r({
    method: "GET", path: "/hospitals/:id/availability", auth: "public",
    handler: async (c) => {
      const cfg = await getConfig(c.store, c.scenario);
      return hospitals.availabilityView(await hospitals.getHospitalBundle(c.store, c.params.id!), cfg, c.now);
    },
  }),
  r({
    method: "GET", path: "/hospitals/:id/reviews", auth: "public", query: z.object({ cursor: z.string().optional() }),
    handler: (c) => reviews.listReviews(c, { hospitalId: c.params.id, cursor: c.query.cursor }),
  }),
  r({
    method: "POST", path: "/hospitals/compare", auth: "public",
    body: z.object({ ids: z.array(z.string()).min(1).max(3), lat: z.number().optional(), lng: z.number().optional() }),
    handler: async (c) => hospitals.compareHospitals(c, await getConfig(c.store, c.scenario), c.body.ids, origin(c.body)),
  }),
  r({
    method: "POST", path: "/hospitals/:id/flags", auth: "optional", body: FlagSchema, status: 201,
    rateLimit: { bucket: "flags", limit: 5, windowSec: 600, by: "ip" },
    handler: (c) => hospitals.createFlag(c, c.params.id!, c.body),
  }),

  // ---- Reviews --------------------------------------------------------------
  r({
    method: "GET", path: "/reviews", auth: "public",
    query: z.object({ hospitalId: z.string().optional(), rating: num.int().min(1).max(5).optional(), verifiedVisit: optBool, cursor: z.string().optional() }),
    handler: (c) => reviews.listReviews(c, c.query),
  }),
  r({
    method: "POST", path: "/reviews", auth: "required", body: CreateReviewSchema, status: 201,
    rateLimit: { bucket: "reviews", limit: 5, windowSec: 3600, by: "user" },
    handler: (c) => reviews.createReview(c, c.body),
  }),
  r({
    method: "POST", path: "/reviews/:id/report", auth: "optional", body: ReportReviewSchema,
    rateLimit: { bucket: "reviewReport", limit: 10, windowSec: 3600, by: "ip" },
    handler: (c) => reviews.reportReview(c, c.params.id!, c.body.reason),
  }),

  // ---- Bookings (patient) ---------------------------------------------------
  r({
    method: "POST", path: "/bookings", auth: "required", action: "booking.create", body: CreateBookingSchema, status: 201,
    rateLimit: { bucket: "bookings", limit: 10, windowSec: 600, by: "user" },
    handler: async (c) => (await booking.createBooking(c, c.body, c.req.headers.get("idempotency-key"))).booking,
  }),
  r({ method: "GET", path: "/bookings", auth: "required", action: "booking.list", handler: (c) => booking.listMyBookings(c) }),
  r({
    method: "GET", path: "/bookings/:id", auth: "optional", query: z.object({ t: z.string().max(64).optional() }),
    handler: (c) => booking.getBooking(c, c.params.id!, c.query.t),
  }),
  r({ method: "POST", path: "/bookings/:id/cancel", auth: "required", body: CancelBookingSchema, handler: (c) => booking.cancelBooking(c, c.params.id!, c.body.reason) }),
  r({
    method: "POST", path: "/bookings/:id/share-link", auth: "required",
    handler: (c) => booking.createShareLink(c, c.params.id!, new URL(c.req.url).origin),
  }),

  // ---- Hospital portal ------------------------------------------------------
  r({ method: "GET", path: "/hospital/dashboard", auth: "required", handler: (c) => portal.dashboard(c) }),
  r({ method: "GET", path: "/hospital/profile", auth: "required", handler: (c) => portal.getProfile(c) }),
  r({ method: "PATCH", path: "/hospital/profile", auth: "required", body: ProfilePatchSchema, handler: (c) => portal.patchProfile(c, c.body) }),
  r({
    method: "POST", path: "/hospital/verification", auth: "required", status: 201,
    body: z.object({ documents: z.array(z.object({ name: z.string().max(120), contentType: z.string(), dataUrl: z.string().max(3_000_000) })).min(1).max(5) }),
    handler: (c) => portal.submitVerification(c, c.body),
  }),
  r({ method: "GET", path: "/hospital/facilities", auth: "required", handler: (c) => portal.listFacilities(c) }),
  r({ method: "POST", path: "/hospital/facilities", auth: "required", body: FacilityUpsertSchema, handler: (c) => portal.upsertFacility(c, c.body) }),
  r({ method: "PATCH", path: "/hospital/facilities", auth: "required", body: FacilityUpsertSchema, handler: (c) => portal.upsertFacility(c, c.body) }),
  r({ method: "DELETE", path: "/hospital/facilities/:capability", auth: "required", handler: (c) => portal.deleteFacility(c, CapabilitySchema.parse(c.params.capability)) }),
  ...(["departments", "specialists"] as const).flatMap((kind) => [
    r({ method: "GET", path: `/hospital/${kind}`, auth: "required", handler: (c) => portal.listStaffRecords(c, kindOf(kind)) }),
    r({ method: "POST", path: `/hospital/${kind}`, auth: "required", body: RecordSchema, status: 201, handler: (c) => portal.createRecord(c, kindOf(kind), c.body) }),
    r({ method: "PATCH", path: `/hospital/${kind}/:id`, auth: "required", body: RecordPatchSchema, handler: (c) => portal.updateRecord(c, kindOf(kind), c.params.id!, c.body) }),
    r({ method: "DELETE", path: `/hospital/${kind}/:id`, auth: "required", handler: (c) => portal.deleteRecord(c, kindOf(kind), c.params.id!) }),
  ]),
  r({ method: "GET", path: "/hospital/availability", auth: "required", handler: (c) => availability.getPortalAvailability(c) }),
  r({ method: "PUT", path: "/hospital/availability", auth: "required", body: AvailabilityUpdateSchema, handler: (c) => availability.updateAvailability(c, c.body) }),
  r({ method: "GET", path: "/hospital/availability/history", auth: "required", handler: (c) => availability.availabilityHistory(c) }),
  r({ method: "GET", path: "/hospital/requests", auth: "required", query: z.object({ status: z.string().max(20).optional() }), handler: (c) => er.listHospitalRequests(c, c.query.status) }),
  r({
    method: "POST", path: "/hospital/requests/:id/respond", auth: "required",
    body: z.object({ action: z.enum(["accept", "decline", "arrived"]), reason: z.string().max(200).optional() }),
    handler: (c) => er.respondToRequest(c, c.params.id!, c.body.action, c.body.reason),
  }),
  r({ method: "GET", path: "/hospital/staff", auth: "required", handler: (c) => portal.listStaff(c) }),
  r({ method: "POST", path: "/hospital/staff", auth: "required", body: StaffInviteSchema, status: 201, handler: (c) => portal.inviteStaff(c, c.body) }),
  r({ method: "PATCH", path: "/hospital/staff/:id", auth: "required", body: StaffPatchSchema, handler: (c) => portal.patchStaff(c, c.params.id!, c.body) }),
  r({ method: "GET", path: "/hospital/audit-logs", auth: "required", handler: (c) => portal.hospitalAudit(c) }),
  r({ method: "POST", path: "/hospital/reviews/:id/response", auth: "required", body: ReviewResponseSchema, handler: (c) => reviews.respondToReview(c, c.params.id!, c.body.text) }),

  // ---- Provider (dispatcher) ------------------------------------------------
  r({ method: "GET", path: "/provider/requests", auth: "required", handler: (c) => dispatch.providerQueue(c) }),
  r({ method: "POST", path: "/provider/bookings/:id/accept", auth: "required", handler: (c) => dispatch.acceptBooking(c, c.params.id!) }),
  r({ method: "POST", path: "/provider/bookings/:id/reject", auth: "required", body: RejectSchema, handler: (c) => dispatch.rejectBooking(c, c.params.id!, c.body.reason) }),
  r({ method: "POST", path: "/provider/bookings/:id/assign", auth: "required", body: AssignSchema, handler: (c) => dispatch.assignBooking(c, c.params.id!, c.body.ambulanceId, c.body.driverId) }),
  r({ method: "GET", path: "/provider/ambulances", auth: "required", handler: (c) => dispatch.listFleet(c) }),
  r({
    method: "POST", path: "/provider/ambulances", auth: "required", status: 201,
    body: z.object({ registration: z.string().trim().min(4).max(20), type: AmbulanceTypeSchema, driverId: z.string().nullable() }),
    handler: (c) => dispatch.createAmbulance(c, c.body),
  }),
  r({
    method: "PATCH", path: "/provider/ambulances/:id", auth: "required",
    body: z.object({ status: z.enum(["available", "offline"]).optional(), driverId: z.string().nullable().optional(), type: AmbulanceTypeSchema.optional() }),
    handler: (c) => dispatch.updateAmbulance(c, c.params.id!, c.body),
  }),
  r({ method: "GET", path: "/provider/drivers", auth: "required", handler: async (c) => ({ items: (await dispatch.listFleet(c)).drivers }) }),
  r({
    method: "POST", path: "/provider/drivers", auth: "required", status: 201,
    body: z.object({ displayName: z.string().trim().min(2).max(60), phone: PhoneSchema }),
    handler: (c) => dispatch.createDriver(c, c.body),
  }),
  r({
    method: "PATCH", path: "/provider/service-area", auth: "required",
    body: z.object({ center: z.object({ lat: z.number(), lng: z.number() }), radiusKm: z.number().min(1).max(100) }),
    handler: (c) => dispatch.updateServiceArea(c, c.body),
  }),
  r({ method: "GET", path: "/provider/stats", auth: "required", handler: (c) => dispatch.providerStats(c) }),

  // ---- Driver ---------------------------------------------------------------
  r({ method: "GET", path: "/driver/assignment", auth: "required", handler: (c) => driver.currentAssignment(c) }),
  r({ method: "POST", path: "/driver/bookings/:id/status", auth: "required", body: DriverStatusSchema, handler: (c) => driver.advanceStatus(c, c.params.id!, c.body.status) }),
  r({
    method: "POST", path: "/driver/location", auth: "required", body: LocationBatchSchema,
    rateLimit: { bucket: "location", limit: 60, windowSec: 60, by: "user" },
    handler: (c) => driver.ingestLocation(c, c.body),
  }),

  // ---- Admin ----------------------------------------------------------------
  r({ method: "GET", path: "/admin/overview", auth: "required", action: "admin.access", handler: (c) => admin.overview(c) }),
  r({ method: "GET", path: "/admin/health", auth: "required", action: "admin.access", handler: (c) => admin.health(c) }),
  r({
    method: "GET", path: "/admin/hospitals", auth: "required", action: "admin.access",
    query: z.object({ status: z.string().max(20).optional(), q: z.string().max(80).optional() }),
    handler: (c) => admin.adminHospitals(c, c.query),
  }),
  r({ method: "GET", path: "/admin/hospitals/:id", auth: "required", action: "admin.access", handler: (c) => admin.adminHospitalDetail(c, c.params.id!) }),
  r({ method: "POST", path: "/admin/hospitals/:id/verify", auth: "required", action: "admin.access", body: VerifyDecisionSchema, handler: (c) => admin.verifyHospital(c, c.params.id!, c.body) }),
  r({ method: "GET", path: "/admin/flags", auth: "required", action: "admin.access", query: z.object({ status: z.string().optional() }), handler: (c) => admin.listFlags(c, c.query.status) }),
  r({ method: "POST", path: "/admin/flags/:id/resolve", auth: "required", action: "admin.access", body: ResolveFlagSchema, handler: (c) => admin.resolveFlag(c, c.params.id!, c.body.resolution) }),
  r({ method: "GET", path: "/admin/providers", auth: "required", action: "admin.access", handler: (c) => admin.adminProviders(c) }),
  r({ method: "POST", path: "/admin/providers/:id/decision", auth: "required", action: "admin.access", body: ProviderDecisionSchema, handler: (c) => admin.decideProvider(c, c.params.id!, c.body.decision, c.body.reason) }),
  r({
    method: "POST", path: "/admin/applications/:id/decision", auth: "required", action: "admin.access",
    body: z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().max(500).optional() }),
    handler: (c) => admin.decideApplication(c, c.params.id!, c.body.decision, c.body.reason),
  }),
  r({ method: "GET", path: "/admin/config", auth: "required", action: "admin.access", handler: async (c) => toAdminConfig(await getConfig(c.store)) }),
  r({ method: "PUT", path: "/admin/config", auth: "required", action: "admin.access", body: AdminConfigSchema, handler: (c) => updateAdminConfig(c, c.body) }),
  r({ method: "GET", path: "/admin/demo", auth: "required", action: "admin.access", handler: async (c) => (await getConfig(c.store)).demo }),
  r({ method: "PUT", path: "/admin/demo", auth: "required", action: "admin.access", body: DemoSettingsSchema, handler: (c) => updateDemoSettings(c, c.body) }),
  r({
    method: "GET", path: "/admin/analytics", auth: "required", action: "admin.access",
    query: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), category: z.string().max(20).optional(), city: z.string().max(60).optional() }),
    handler: (c) => admin.analytics(c, c.query),
  }),
  r({
    method: "GET", path: "/admin/audit-logs", auth: "required", action: "admin.access",
    query: z.object({ resourceType: z.string().max(40).optional(), actorUid: z.string().max(80).optional(), resourceId: z.string().max(80).optional() }),
    handler: (c) => admin.auditLogs(c, c.query),
  }),
  r({ method: "GET", path: "/admin/reviews", auth: "required", action: "admin.access", handler: (c) => reviews.moderationQueue(c) }),
  r({ method: "POST", path: "/admin/reviews/:id/moderate", auth: "required", action: "admin.access", body: ModerateReviewSchema, handler: (c) => reviews.moderateReview(c, c.params.id!, c.body.decision) }),
  r({ method: "POST", path: "/admin/users/:id/role", auth: "required", action: "admin.access", body: SetRoleSchema, handler: (c) => admin.setUserRole(c, c.params.id!, c.body) }),

  // ---- Scheduled jobs (Bearer CRON_SECRET) ----------------------------------
  // POST for manual runs; GET because Vercel Cron calls with GET (and sends the secret).
  ...(
    [
      ["/jobs/freshness-sweep", jobs.freshnessSweep],
      ["/jobs/demo-ticker", jobs.demoTicker],
      ["/jobs/retention-cleanup", jobs.retentionCleanup],
      ["/jobs/booking-timeout", jobs.bookingTimeout],
    ] as const
  ).flatMap(([path, job]) =>
    (["POST", "GET"] as const).map((method) => r({ method, path, auth: "public", cron: true, handler: (c) => job(c) })),
  ),
];
