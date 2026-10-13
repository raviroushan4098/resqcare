/**
 * Synthetic seed data. Everything here is fictional: hospital, provider and
 * person names end in "(fictional)", addresses are invented, and phone
 * numbers use the non-dialable +91 00000 range so a demo tap never rings a
 * real number. A seeded PRNG keeps the data identical on every run.
 */
import type { Capability, Category, Role, StaffPermission, VerificationState } from "@/lib/schemas";
import { CAPABILITIES } from "@/lib/schemas";
import { DEFAULT_DEMO, DEFAULT_FRESHNESS, DEFAULT_SEARCH, DEFAULT_WEIGHTS } from "../config/constants";
import { geohash } from "../domain/geo";
import type {
  AmbulanceDoc,
  AuditDoc,
  AvailabilityDoc,
  AvailabilityHistoryDoc,
  BookingDoc,
  DepartmentDoc,
  FacilityDoc,
  FlagDoc,
  HospitalDoc,
  ProviderDoc,
  ReviewDoc,
  SearchLogDoc,
  SpecialistDoc,
  UserDoc,
  VerificationDoc,
  ApplicationDoc,
} from "../repositories/collections";

export const DEMO_CITY = { name: "Greater Noida", lat: 28.4744, lng: 77.504 } as const;

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIXES = [
  "Sanjeevani", "Arogya", "Shanti", "Jeevan Rekha", "Sunrise", "Lotus", "Riverbank", "Nirmal",
  "Prakash", "Seva Sadan", "Kalyan", "Harmony", "Greenfield", "Ashray", "Navjeevan", "Unity",
  "Silverline", "Amrit", "Vatsalya", "Medway",
];
const SUFFIXES = ["Hospital", "Multispeciality Hospital", "Medical Centre", "Heart and Trauma Institute", "Community Hospital"];
const STREETS = ["Neem Marg", "Gulmohar Road", "Peepal Path", "Ashoka Lane", "Kadamb Avenue", "Banyan Street", "Chandan Marg", "Mehndi Lane"];
const LOCALITIES = ["Knowledge Park (fictional)", "Sector Alpha (fictional)", "Pari Vihar (fictional)", "Lake View (fictional)", "Green Valley (fictional)"];
const SPECIALTIES = ["Cardiology", "Neurology", "Orthopaedics", "Pulmonology", "General Surgery", "Paediatrics", "Nephrology", "Obstetrics"];
const DOCTORS = ["A. Sharma", "R. Verma", "S. Khan", "P. Iyer", "M. Das", "K. Singh", "N. Reddy", "J. Thomas", "F. Ansari", "L. Menon"];
const REVIEW_TEXTS = [
  "Staff in the emergency ward were calm and explained each step to us clearly.",
  "Waiting time at night was long, but the doctors were attentive once we were seen.",
  "Clean wards and helpful nurses. Parking was difficult to find in the evening.",
  "Billing desk was slow and confusing. Treatment itself was fine.",
  "Reception directed us quickly and the ambulance bay was easy to reach.",
  "We were referred elsewhere after two hours, which was frustrating for the family.",
  "Doctors spoke in Hindi with my grandmother, which made her comfortable.",
  "Very crowded on the weekend, and we had to ask several times for updates.",
];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DEMO_USERS: { id: string; displayName: string; email: string; role: Role; hospitalId?: string; providerId?: string; permissions?: StaffPermission[] }[] = [
  { id: "u_patient_demo", displayName: "Asha (fictional patient)", email: "patient@demo.resqcare.test", role: "patient" },
  { id: "u_hadmin_demo", displayName: "Rohit (fictional hospital admin)", email: "hospital-admin@demo.resqcare.test", role: "hospital_admin", hospitalId: "h-001", permissions: ["updateAvailability", "respondRequests", "viewPatientContact"] },
  { id: "u_hstaff_demo", displayName: "Meena (fictional hospital staff)", email: "hospital-staff@demo.resqcare.test", role: "hospital_staff", hospitalId: "h-001", permissions: ["updateAvailability", "respondRequests"] },
  { id: "u_dispatch_demo", displayName: "Vikram (fictional dispatcher)", email: "dispatcher@demo.resqcare.test", role: "dispatcher", providerId: "p-manual" },
  { id: "u_driver_demo", displayName: "Sunil (fictional driver)", email: "driver@demo.resqcare.test", role: "driver", providerId: "p-manual" },
  { id: "u_driver_demo2", displayName: "Imran (fictional driver)", email: "driver2@demo.resqcare.test", role: "driver", providerId: "p-manual" },
  { id: "u_admin_demo", displayName: "Kavita (fictional super admin)", email: "admin@demo.resqcare.test", role: "super_admin" },
];

export interface SeedData {
  users: UserDoc[];
  hospitals: HospitalDoc[];
  facilities: FacilityDoc[];
  availability: AvailabilityDoc[];
  availabilityHistory: AvailabilityHistoryDoc[];
  departments: DepartmentDoc[];
  specialists: SpecialistDoc[];
  providers: ProviderDoc[];
  ambulances: AmbulanceDoc[];
  bookings: BookingDoc[];
  reviews: ReviewDoc[];
  searchLogs: SearchLogDoc[];
  flags: FlagDoc[];
  verifications: VerificationDoc[];
  applications: ApplicationDoc[];
  auditLogs: AuditDoc[];
  config: { id: string; [k: string]: unknown }[];
}

export function buildSeed(nowDate: Date, opts: { demoModeDefault?: boolean } = {}): SeedData {
  const now = nowDate.getTime();
  const iso = (t: number) => new Date(t).toISOString();
  const ago = (ms: number) => iso(now - ms);
  const rnd = mulberry32(20261013);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
  const stamps = (createdAgo = 200 * DAY) => ({ createdAt: ago(createdAgo), updatedAt: ago(rnd() * 5 * DAY) });

  const users: UserDoc[] = DEMO_USERS.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    phone: null,
    role: u.role,
    hospitalId: u.hospitalId ?? null,
    providerId: u.providerId ?? null,
    permissions: u.permissions ?? [],
    locale: "en",
    status: "active",
    consentAt: ago(100 * DAY),
    lastLoginAt: null,
    ...stamps(),
  }));

  const hospitals: HospitalDoc[] = [];
  const facilities: FacilityDoc[] = [];
  const availability: AvailabilityDoc[] = [];
  const availabilityHistory: AvailabilityHistoryDoc[] = [];
  const departments: DepartmentDoc[] = [];
  const specialists: SpecialistDoc[] = [];

  for (let i = 0; i < 40; i++) {
    const id = `h-${String(i + 1).padStart(3, "0")}`;
    const name = `${PREFIXES[i % PREFIXES.length]} ${SUFFIXES[(Math.floor(i / PREFIXES.length) + i) % SUFFIXES.length]} (fictional)`;
    const v = rnd();
    // h-001 is the demo hospital portal's hospital: approved and well equipped.
    let verificationStatus: VerificationState = v < 0.65 ? "approved" : v < 0.8 ? "pending" : "unverified";
    if (i === 0) verificationStatus = "approved";
    if (i === 38) verificationStatus = "suspended";
    const approved = verificationStatus === "approved";

    const r = i === 0 ? 0.02 : Math.sqrt(rnd()) * 0.2;
    const theta = rnd() * 2 * Math.PI;
    const lat = Number((DEMO_CITY.lat + r * Math.cos(theta)).toFixed(5));
    const lng = Number((DEMO_CITY.lng + (r * Math.sin(theta)) / Math.cos((DEMO_CITY.lat * Math.PI) / 180)).toFixed(5));
    const big = i % 3 === 0;

    const specialtyList = SPECIALTIES.filter(() => rnd() < (big ? 0.6 : 0.3));
    if (specialtyList.length === 0) specialtyList.push(pick(SPECIALTIES));
    if (i === 0) specialtyList.splice(0, specialtyList.length, "Cardiology", "Neurology", "Orthopaedics", "Pulmonology", "General Surgery");

    let has24x7 = false;
    for (const cap of CAPABILITIES) {
      const present = i === 0 ? cap !== "burn_unit" : cap === "emergency_24x7" ? rnd() < 0.85 : rnd() < (big ? 0.8 : 0.4);
      const t = rnd();
      // Unrecorded capabilities are simply absent; a few are explicitly "not available".
      if (!present && rnd() < 0.7) continue;
      let confirmed = false;
      let lastVerifiedAt: string | null = null;
      if (present) {
        if (!approved) {
          lastVerifiedAt = t < 0.5 ? ago((10 + rnd() * 200) * DAY) : null;
        } else if (i === 0 || t < 0.6) {
          confirmed = true;
          lastVerifiedAt = ago(rnd() * (DEFAULT_FRESHNESS.facilityDays - 5) * DAY);
        } else if (t < 0.85) {
          confirmed = true;
          lastVerifiedAt = ago((DEFAULT_FRESHNESS.facilityDays + 5 + rnd() * 200) * DAY);
        }
      }
      if (cap === "emergency_24x7" && present) has24x7 = true;
      facilities.push({
        id: `${id}_${cap}`,
        hospitalId: id,
        capability: cap,
        confirmed,
        present,
        lastVerifiedAt,
        verifiedBy: confirmed ? "u_admin_demo" : null,
        source: "seed",
        notes: null,
        ...stamps(),
      });
    }

    const icuTotal = big ? 20 + Math.floor(rnd() * 30) : 4 + Math.floor(rnd() * 10);
    const erTotal = big ? 15 + Math.floor(rnd() * 20) : 5 + Math.floor(rnd() * 8);
    const ventTotal = Math.max(1, Math.floor(icuTotal / 3));
    const a = rnd();
    const mode = !approved ? "none" : i === 0 ? "stale9h" : a < 0.15 ? "none" : a < 0.65 ? "fresh" : "stale";
    const reportedAt =
      mode === "fresh" ? ago((2 + rnd() * 50) * MIN) : mode === "stale" ? ago((3 + rnd() * 30) * HOUR) : mode === "stale9h" ? ago(9 * HOUR) : null;
    const bed = (total: number) => ({ available: Math.floor(rnd() * (total + 1)), total });
    availability.push({
      id,
      hospitalId: id,
      icuBeds: reportedAt ? bed(icuTotal) : null,
      emergencyBeds: reportedAt ? bed(erTotal) : null,
      ventilators: reportedAt ? bed(ventTotal) : null,
      servicesNow: reportedAt ? { ct: rnd() < 0.8, cathLab: rnd() < 0.5, specialistOnDuty: rnd() < 0.6 } : null,
      updatedAt: reportedAt ?? ago(30 * DAY),
      reportedAt,
      updatedBy: reportedAt ? (i === 0 ? "u_hstaff_demo" : null) : null,
      updatedByName: reportedAt ? (i === 0 ? "Meena (fictional hospital staff)" : "Hospital desk (fictional)") : null,
      source: "seed",
      version: reportedAt ? 3 : 0,
      stale: mode === "stale" || mode === "stale9h",
      createdAt: ago(200 * DAY),
    });
    if (i === 0) {
      for (let k = 1; k <= 12; k++) {
        availabilityHistory.push({
          id: `hist-${k}`,
          hospitalId: id,
          icuBeds: bed(icuTotal),
          emergencyBeds: bed(erTotal),
          ventilators: bed(ventTotal),
          servicesNow: { ct: true, cathLab: k % 3 !== 0, specialistOnDuty: k % 2 === 0 },
          at: ago((9 + k * 6) * HOUR),
          byName: k % 2 ? "Meena (fictional hospital staff)" : "Rohit (fictional hospital admin)",
          expiresAt: iso(now + 90 * DAY),
        });
      }
    }

    for (const [k, s] of specialtyList.entries()) {
      departments.push({
        id: `${id}-dep-${k}`,
        hospitalId: id,
        name: s,
        confirmed: approved && rnd() < 0.85,
        lastVerifiedAt: approved ? ago(rnd() * 60 * DAY) : null,
        ...stamps(),
      });
      if (k < 3) {
        specialists.push({
          id: `${id}-doc-${k}`,
          hospitalId: id,
          name: `Dr. ${pick(DOCTORS)} (fictional)`,
          specialty: s,
          onDuty: rnd() < 0.5,
          confirmed: approved && rnd() < 0.8,
          lastVerifiedAt: approved ? ago(rnd() * 60 * DAY) : null,
          ...stamps(),
        });
      }
    }

    hospitals.push({
      id,
      name,
      address: `${10 + Math.floor(rnd() * 180)} ${pick(STREETS)}, ${pick(LOCALITIES)}, ${DEMO_CITY.name} (fictional address)`,
      city: DEMO_CITY.name,
      location: { lat, lng, geohash: geohash(lat, lng) },
      phones: [`+91 00000 ${String(10000 + i).slice(-5)}`],
      operatingHours: big ? "Mon to Sun, 24 hours" : "Mon to Sat, 8:00 to 20:00",
      emergencyHours: has24x7 ? "24 hours" : "8:00 to 22:00",
      emergency24x7: has24x7,
      specialties: specialtyList,
      verificationStatus,
      verifiedAt: approved ? ago((5 + rnd() * 300) * DAY) : null,
      verifiedBy: approved ? "u_admin_demo" : null,
      registryRef: `DEMO-REG-${1000 + i}`,
      isFictional: true,
      ratingAverage: null,
      ratingCount: 0,
      ...stamps(),
    });
  }

  // Reviews: opinions only. Ratings never feed eligibility.
  const reviews: ReviewDoc[] = [];
  for (let k = 0; k < 110; k++) {
    const h = hospitals[Math.floor(rnd() * hospitals.length)]!;
    const status = k < 100 ? "approved" : k < 106 ? "pending" : "rejected";
    reviews.push({
      id: `r-${k + 1}`,
      hospitalId: h.id,
      authorUid: `u_seed_reviewer_${k % 37}`,
      authorName: `${pick(["Anil", "Bharti", "Chetan", "Deepa", "Farah", "Gopal", "Hina", "Jatin"])} (fictional)`,
      rating: Math.max(1, Math.min(5, Math.round(2 + rnd() * 3.4))),
      text: pick(REVIEW_TEXTS),
      visitDate: ago((5 + rnd() * 300) * DAY).slice(0, 10),
      status,
      verifiedVisit: rnd() < 0.4,
      reportCount: k % 23 === 0 ? 2 : 0,
      response:
        rnd() < 0.15 ? { text: "Thank you for the feedback. We have shared it with our emergency team.", by: "hospital", at: ago(rnd() * 20 * DAY) } : null,
      createdAt: ago((1 + rnd() * 300) * DAY),
      updatedAt: ago(rnd() * 10 * DAY),
    });
  }
  // The demo patient reviewed h-003 recently, so a second review there is blocked (one per 30 days).
  reviews.push({
    id: "r-demo-patient",
    hospitalId: "h-003",
    authorUid: "u_patient_demo",
    authorName: "Asha (fictional)",
    rating: 4,
    text: "Quick triage when I brought my father in. The staff kept us informed throughout.",
    visitDate: ago(12 * DAY).slice(0, 10),
    status: "approved",
    verifiedVisit: true,
    reportCount: 0,
    response: null,
    createdAt: ago(10 * DAY),
    updatedAt: ago(10 * DAY),
  });
  for (const h of hospitals) {
    const rs = reviews.filter((r) => r.hospitalId === h.id && r.status === "approved");
    h.ratingCount = rs.length;
    h.ratingAverage = rs.length ? Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10 : null;
  }

  const providers: ProviderDoc[] = [
    {
      id: "p-sim",
      name: "Rapid Response Demo Ambulances (fictional)",
      contactPhone: "+91 00000 20001",
      serviceArea: { center: { ...DEMO_CITY }, radiusKm: 40 },
      status: "approved",
      isDemo: true,
      simulated: true,
      approvedAt: ago(120 * DAY),
      decisionReason: null,
      ownerUid: null,
      ...stamps(),
    },
    {
      id: "p-manual",
      name: "City Care Demo Ambulances (fictional)",
      contactPhone: "+91 00000 20002",
      serviceArea: { center: { ...DEMO_CITY }, radiusKm: 30 },
      status: "approved",
      isDemo: true,
      simulated: false,
      approvedAt: ago(90 * DAY),
      decisionReason: null,
      ownerUid: "u_dispatch_demo",
      ...stamps(),
    },
    {
      id: "p-pending",
      name: "Highway Aid Ambulance Service (fictional)",
      contactPhone: "+91 00000 20003",
      serviceArea: { center: { lat: DEMO_CITY.lat + 0.1, lng: DEMO_CITY.lng + 0.1 }, radiusKm: 25 },
      status: "pending",
      isDemo: true,
      simulated: false,
      approvedAt: null,
      decisionReason: null,
      ownerUid: null,
      ...stamps(10 * DAY),
    },
  ];

  const ambulances: AmbulanceDoc[] = [
    ...[1, 2, 3, 4].map((n): AmbulanceDoc => ({
      id: `a-sim-${n}`,
      providerId: "p-sim",
      registration: `DEMO-SIM-0${n}`,
      type: n % 2 ? "basic" : "als",
      driverId: `u_simdriver_${n}`,
      status: "available",
      currentBookingId: null,
      lastLocation: null,
      ...stamps(),
    })),
    { id: "a-man-1", providerId: "p-manual", registration: "DEMO-CC-01", type: "als", driverId: "u_driver_demo", status: "available", currentBookingId: null, lastLocation: null, ...stamps() },
    { id: "a-man-2", providerId: "p-manual", registration: "DEMO-CC-02", type: "basic", driverId: "u_driver_demo2", status: "available", currentBookingId: null, lastLocation: null, ...stamps() },
    { id: "a-man-3", providerId: "p-manual", registration: "DEMO-CC-03", type: "basic", driverId: null, status: "offline", currentBookingId: null, lastLocation: null, ...stamps() },
  ];
  for (let n = 1; n <= 4; n++) {
    users.push({
      id: `u_simdriver_${n}`,
      displayName: `${["Ravi", "Ajay", "Pooja", "Salim"][n - 1]} (fictional simulated driver)`,
      email: null,
      phone: `+9100000300${n}`,
      role: "driver",
      hospitalId: null,
      providerId: "p-sim",
      permissions: [],
      locale: "en",
      status: "active",
      consentAt: null,
      lastLoginAt: null,
      ...stamps(),
    });
  }
  for (const u of users) if (u.id.startsWith("u_driver_demo")) u.phone = u.id.endsWith("2") ? "+910000030012" : "+910000030011";

  // Historic bookings and search logs so analytics have something honest to show.
  const bookings: BookingDoc[] = [];
  const searchLogs: SearchLogDoc[] = [];
  const categories: Category[] = ["cardiac", "stroke", "accident", "breathing", "trauma", "other"];
  for (let d = 29; d >= 0; d--) {
    const n = 15 + Math.floor(rnd() * 35);
    for (let k = 0; k < n; k++) {
      const t = now - d * DAY - rnd() * DAY;
      if (t > now) continue;
      const noMatch = rnd() < 0.08;
      const err = rnd() < 0.03;
      searchLogs.push({
        id: `sl-${d}-${k}`,
        category: pick(categories),
        latencyMs: Math.round(250 + rnd() * 900 + (rnd() < 0.05 ? 1500 : 0)),
        resultCount: noMatch || err ? 0 : 1 + Math.floor(rnd() * 9),
        noConfidentMatch: noMatch,
        degraded: rnd() < 0.1 ? ["ai"] : rnd() < 0.1 ? ["maps"] : [],
        aiSource: rnd() < 0.85 ? "ai" : "rule",
        city: DEMO_CITY.name,
        outcome: err ? "error" : "ok",
        errorCause: err ? pick(["upstream_timeout", "validation", "internal"]) : null,
        createdAt: iso(t),
        expiresAt: iso(t + 30 * DAY),
      });
    }
    const nb = 2 + Math.floor(rnd() * 6);
    for (let k = 0; k < nb; k++) {
      const t = now - d * DAY - rnd() * DAY - 2 * HOUR;
      const o = rnd();
      const final =
        o < 0.72 ? "Completed" : o < 0.82 ? "Cancelled" : o < 0.9 ? "TimedOut" : o < 0.96 ? "Rejected" : "Failed";
      const tail: Record<string, string[]> = {
        Completed: ["Accepted", "Assigned", "EnRoute", "Arrived", "Completed"],
        Failed: ["Accepted", "Assigned", "EnRoute", "Failed"],
      };
      const path = ["Requested", "Searching", ...(tail[final] ?? [final])] as BookingDoc["status"][];
      bookings.push({
        id: `b-hist-${d}-${k}`,
        patientUid: `u_seed_patient_${k}`,
        idempotencyKey: `seed-${d}-${k}`,
        status: final,
        demo: true,
        type: rnd() < 0.7 ? "basic" : "als",
        patientCount: 1,
        note: null,
        pickup: { lat: DEMO_CITY.lat + (rnd() - 0.5) * 0.2, lng: DEMO_CITY.lng + (rnd() - 0.5) * 0.2, address: null },
        destinationHospitalId: hospitals[Math.floor(rnd() * 10)]!.id,
        providerId: final === "TimedOut" ? null : rnd() < 0.6 ? "p-sim" : "p-manual",
        candidateProviderIds: [],
        rejectedBy: [],
        ambulanceId: null,
        driverId: null,
        contact: { name: "Seed patient (fictional)", phone: "+910000099999" },
        events: path.map((s, idx) => ({ state: s, at: iso(t + idx * (3 + rnd() * 6) * MIN), by: "system", byRole: "system", note: null })),
        shareToken: null,
        shareExpiresAt: null,
        searchingSince: null,
        lastLocation: null,
        etaMinutes: null,
        failureReason: final === "Failed" ? "vehicle_breakdown" : null,
        simStart: null,
        createdAt: iso(t),
        updatedAt: iso(t + 40 * MIN),
      });
    }
  }

  const flags: FlagDoc[] = [
    { id: "f-1", hospitalId: "h-004", field: "availability", description: "Called the hospital and they said the ICU was full, but the app showed free beds.", status: "open", resolution: null, resolvedBy: null, reporterHash: null, createdAt: ago(2 * HOUR) },
    { id: "f-2", hospitalId: "h-007", field: "contact", description: "The listed phone number did not connect when I tried twice.", status: "open", resolution: null, resolvedBy: null, reporterHash: null, createdAt: ago(1 * DAY) },
    { id: "f-3", hospitalId: "h-001", field: "hours", description: "Outpatient hours shown are different from the board at the gate.", status: "resolved", resolution: "Hospital updated its hours.", resolvedBy: "u_admin_demo", reporterHash: null, createdAt: ago(9 * DAY) },
  ];

  const verifications: VerificationDoc[] = hospitals
    .filter((h) => h.verificationStatus === "pending")
    .map((h, k) => ({
      id: `v-${h.id}`,
      hospitalId: h.id,
      submittedAt: ago((1 + k) * DAY),
      submittedBy: "u_seed_hospital_admin",
      documents: [
        { name: "Registration certificate (fictional sample)", path: "/demo-docs/registration-certificate.svg", contentType: "image/svg+xml" },
        { name: "Facility evidence (fictional sample)", path: "/demo-docs/facility-evidence.svg", contentType: "image/svg+xml" },
      ],
      checklist: null,
      decision: "pending",
      reason: null,
      decidedBy: null,
      decidedAt: null,
    }));

  const applications: ApplicationDoc[] = [
    { id: "app-1", uid: "u_seed_applicant_1", type: "provider", orgName: "Highway Aid Ambulance Service (fictional)", city: DEMO_CITY.name, registryRef: "DEMO-AMB-778", contactPhone: "+91 00000 20003", status: "pending", reason: null, ...stamps(10 * DAY) },
    { id: "app-2", uid: "u_seed_applicant_2", type: "hospital", orgName: "Lakeside Clinic (fictional)", city: DEMO_CITY.name, registryRef: "DEMO-REG-9001", contactPhone: "+91 00000 20004", status: "pending", reason: null, ...stamps(3 * DAY) },
  ];

  const auditLogs: AuditDoc[] = [
    { id: "al-1", actorUid: "u_admin_demo", actorRole: "super_admin", action: "hospital.verify.approve", resourceType: "hospital", resourceId: "h-001", hospitalId: "h-001", before: { verificationStatus: "pending" }, after: { verificationStatus: "approved" }, ipHash: null, createdAt: ago(40 * DAY) },
    { id: "al-2", actorUid: "u_hstaff_demo", actorRole: "hospital_staff", action: "availability.update", resourceType: "hospitalAvailability", resourceId: "h-001", hospitalId: "h-001", before: { icuBeds: { available: 4, total: 30 } }, after: { icuBeds: { available: 2, total: 30 } }, ipHash: null, createdAt: ago(9 * HOUR) },
    { id: "al-3", actorUid: "u_admin_demo", actorRole: "super_admin", action: "config.update", resourceType: "systemConfiguration", resourceId: "ranking", hospitalId: null, before: { weights: { ...DEFAULT_WEIGHTS, travel: 0.35, rating: 0 } }, after: { weights: DEFAULT_WEIGHTS }, ipHash: null, createdAt: ago(5 * DAY) },
  ];

  const config = [
    { id: "ranking", weights: { ...DEFAULT_WEIGHTS }, updatedAt: ago(5 * DAY) },
    { id: "freshness", ...DEFAULT_FRESHNESS, updatedAt: ago(5 * DAY) },
    { id: "search", ...DEFAULT_SEARCH, radiusOptionsKm: [5, 10, 15, 25], updatedAt: ago(5 * DAY) },
    { id: "demo", demoMode: opts.demoModeDefault ?? true, ...DEFAULT_DEMO, updatedAt: ago(5 * DAY) },
    { id: "emergency", national: "112", ambulance: "108", ambulanceAlt: "102", updatedAt: ago(5 * DAY) },
  ];

  return {
    users, hospitals, facilities, availability, availabilityHistory, departments, specialists,
    providers, ambulances, bookings, reviews, searchLogs, flags, verifications, applications, auditLogs, config,
  };
}
