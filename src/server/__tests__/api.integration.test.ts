// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bookingBody, makeApp, USERS } from "@/test/server";
import { C, type AuditDoc, type BookingDoc } from "../repositories/collections";

const key = () => crypto.randomUUID();

describe("public config and health", () => {
  it("serves public config without auth", async () => {
    const { call } = await makeApp();
    const r = await call("GET", "/config/public");
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ demoMode: true, emergencyNumbers: { national: "112" } });
  });

  it("returns the error envelope for unknown endpoints", async () => {
    const { call } = await makeApp();
    const r = await call("GET", "/nope");
    expect(r.status).toBe(404);
    expect(r.json).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(r.json.meta.requestId).toMatch(/^req_/);
  });
});

describe("emergency search", () => {
  it("returns only hospitals with every required capability, with tiers and estimates", async () => {
    const { call } = await makeApp();
    const r = await call("POST", "/emergency/search", { body: { category: "stroke", lat: 28.4744, lng: 77.504, radiusKm: 25 } });
    expect(r.status).toBe(200);
    const results = r.json.data.results as { facilities: { capability: string; tier: string }[]; etaIsEstimate: boolean; availability: { tier: string } }[];
    expect(results.length).toBeGreaterThan(0);
    for (const res of results) {
      for (const cap of ["ct_scan", "stroke_unit"]) {
        const f = res.facilities.find((x) => x.capability === cap);
        expect(f && ["confirmed", "reported"].includes(f.tier)).toBe(true);
      }
      expect(res.etaIsEstimate).toBe(true);
      expect(["confirmed", "reported", "unknown"]).toContain(res.availability.tier);
    }
    // No Routes key in tests, so distances are flagged approximate.
    expect(r.json.meta.degraded).toContain("maps");
  });

  it("returns no confident match with nearest hospitals to phone", async () => {
    const { call } = await makeApp();
    const r = await call("POST", "/emergency/search", { body: { category: "cardiac", lat: 28.4744, lng: 77.504, radiusKm: 10 }, scenario: "no-match" });
    expect(r.json.data.noConfidentMatch).toBe(true);
    expect(r.json.data.results).toHaveLength(0);
    expect(r.json.data.nearest.length).toBeGreaterThan(0);
  });

  it("still returns results when AI and maps are down", async () => {
    const { call } = await makeApp();
    const r = await call("POST", "/emergency/search", { body: { category: "other", text: "chest pain", lat: 28.4744, lng: 77.504, radiusKm: 25 }, scenario: "ai-down" });
    expect(r.status).toBe(200);
    expect(r.json.meta.degraded).toEqual(expect.arrayContaining(["ai", "maps"]));
    expect(r.json.data.intent.source).toBe("rule");
    expect(r.json.data.results.length).toBeGreaterThan(0);
  });

  it("validates input with field-level errors", async () => {
    const { call } = await makeApp();
    const r = await call("POST", "/emergency/search", { body: { category: "x", lat: 200 } });
    expect(r.status).toBe(400);
    expect(r.json.error!.code).toBe("VALIDATION_FAILED");
    expect(r.json.error!.details!.map((d) => d.path)).toEqual(expect.arrayContaining(["category", "lat"]));
  });

  it("rate limits guests by IP", async () => {
    const { call } = await makeApp();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await call("POST", "/emergency/search", { body: { category: "other", lat: 28.47, lng: 77.5, radiusKm: 5 } })).status;
    expect(last).toBe(429);
  });
});

describe("hospitals", () => {
  it("never shows availability for unverified hospitals", async () => {
    const { call } = await makeApp();
    const r = await call("GET", "/hospitals?limit=50");
    const items = r.json.data.items as { verification: string; availability: { tier: string; icuBeds: number | null } }[];
    expect(items.some((h) => h.verification !== "approved")).toBe(true);
    for (const h of items.filter((x) => x.verification !== "approved")) {
      expect(h.availability.tier).toBe("unknown");
      expect(h.availability.icuBeds).toBeNull();
    }
  });

  it("shows h-001 availability (9 hours old) as reported, not confirmed", async () => {
    const { call } = await makeApp();
    const r = await call("GET", "/hospitals/h-001/availability");
    expect(r.json.data.tier).toBe("reported");
  });

  it("404s unknown hospitals", async () => {
    const { call } = await makeApp();
    expect((await call("GET", "/hospitals/h-999")).status).toBe(404);
  });

  it("compares at most three hospitals", async () => {
    const { call } = await makeApp();
    expect((await call("POST", "/hospitals/compare", { body: { ids: ["h-001", "h-002", "h-003", "h-004"] } })).status).toBe(400);
    expect((await call("POST", "/hospitals/compare", { body: { ids: ["h-001", "h-003"] } })).json.data.items).toHaveLength(2);
  });
});

describe("bookings", () => {
  it("creates exactly one booking for a double submit with the same key", async () => {
    const { call, store } = await makeApp();
    const k = key();
    const [a, b] = await Promise.all([
      call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": k } }),
      call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": k } }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.json.data.id).toBe(b.json.data.id);
    const mine = (await store.query<BookingDoc>(C.bookings, { where: [["patientUid", "==", USERS.patient]] }));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.status).toBe("Searching");
  });

  it("requires an idempotency key", async () => {
    const { call } = await makeApp();
    const r = await call("POST", "/bookings", { as: USERS.patient, body: bookingBody() });
    expect(r.status).toBe(400);
  });

  it("refuses pickups outside every service area", async () => {
    const { call } = await makeApp();
    const r = await call("POST", "/bookings", { as: USERS.patient, body: bookingBody({ pickup: { lat: 19.07, lng: 72.87, consent: true } }), headers: { "idempotency-key": key() } });
    expect(r.status).toBe(422);
    expect(r.json.error!.details![0]!.issue).toBe("no_providers_in_range");
  });

  it("hides the booking from strangers and anonymous users", async () => {
    const { call } = await makeApp();
    const created = await call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": key() } });
    const id = created.json.data.id;
    expect((await call("GET", `/bookings/${id}`)).status).toBe(401);
    expect((await call("GET", `/bookings/${id}`, { as: "guest_strangerabc123" })).status).toBe(403);
    expect((await call("GET", `/bookings/${id}`, { as: USERS.driver2 })).status).toBe(403);
    expect((await call("GET", `/bookings/${id}?t=wrongtoken`)).status).toBe(401);
  });

  it("lets a share link read a limited view without contact details", async () => {
    const { call } = await makeApp();
    const created = await call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": key() } });
    const id = created.json.data.id;
    const link = await call("POST", `/bookings/${id}/share-link`, { as: USERS.patient });
    const token = new URL(link.json.data.url).searchParams.get("t")!;
    const shared = await call("GET", `/bookings/${id}?t=${token}`);
    expect(shared.status).toBe(200);
    expect(shared.json.data.contact).toBeNull();
    expect(shared.json.data.viewerRole).toBe("shared");
  });

  it("assigning the same vehicle twice at once gives one success and one 409", async () => {
    const { call, store } = await makeApp();
    await store.update(C.config, "demo", { simulateDispatch: false });
    const mk = async () => (await call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": key() } })).json.data.id as string;
    const [b1, b2] = [await mk(), await mk()];
    await call("POST", `/provider/bookings/${b1}/accept`, { as: USERS.dispatcher });
    await call("POST", `/provider/bookings/${b2}/accept`, { as: USERS.dispatcher });
    const [r1, r2] = await Promise.all([
      call("POST", `/provider/bookings/${b1}/assign`, { as: USERS.dispatcher, body: { ambulanceId: "a-man-2", driverId: USERS.driver2 } }),
      call("POST", `/provider/bookings/${b2}/assign`, { as: USERS.dispatcher, body: { ambulanceId: "a-man-2", driverId: USERS.driver2 } }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });

  it("runs the full manual lifecycle with one-step driver transitions", async () => {
    const { call, store } = await makeApp();
    await store.update(C.config, "demo", { simulateDispatch: false });
    const id = (await call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": key() } })).json.data.id;
    let view = (await call("GET", `/bookings/${id}`, { as: USERS.patient })).json.data;
    expect(view.status).toBe("Searching");
    expect(view.provider).toBeNull();
    await call("POST", `/provider/bookings/${id}/accept`, { as: USERS.dispatcher });
    await call("POST", `/provider/bookings/${id}/assign`, { as: USERS.dispatcher, body: { ambulanceId: "a-man-1", driverId: USERS.driver } });
    expect((await call("POST", `/driver/bookings/${id}/status`, { as: USERS.driver, body: { status: "Arrived" } })).status).toBe(409);
    expect((await call("POST", `/driver/bookings/${id}/status`, { as: USERS.driver2, body: { status: "EnRoute" } })).status).toBe(403);
    expect((await call("POST", `/driver/bookings/${id}/status`, { as: USERS.driver, body: { status: "EnRoute" } })).status).toBe(200);
    const loc = await call("POST", "/driver/location", { as: USERS.driver, body: { bookingId: id, points: [{ lat: 28.48, lng: 77.51, ts: new Date().toISOString() }] } });
    expect(loc.json.data.accepted).toBe(1);
    view = (await call("GET", `/bookings/${id}`, { as: USERS.patient })).json.data;
    expect(view.lastLocation).not.toBeNull();
    expect(view.etaMinutes).not.toBeNull();
    expect(view.driver.phone).not.toBeNull(); // revealed once assigned
    await call("POST", `/driver/bookings/${id}/status`, { as: USERS.driver, body: { status: "Arrived" } });
    await call("POST", `/driver/bookings/${id}/status`, { as: USERS.driver, body: { status: "Completed" } });
    const after = await call("POST", "/driver/location", { as: USERS.driver, body: { bookingId: id, points: [{ lat: 28.48, lng: 77.51, ts: new Date().toISOString() }] } });
    expect(after.json.data).toEqual({ accepted: 0, sharing: false });
    view = (await call("GET", `/bookings/${id}`, { as: USERS.patient })).json.data;
    expect(view.status).toBe("Completed");
    expect(view.lastLocation).toBeNull();
  });

  it("simulates the demo lifecycle to Completed over time", async () => {
    const start = new Date();
    const { call, store } = await makeApp(start);
    const id = (await call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": key() } })).json.data.id;
    // Pretend the request was made 10 minutes ago, then let the ticker catch up.
    const b = (await store.get<BookingDoc>(C.bookings, id))!;
    const shift = (iso: string) => new Date(new Date(iso).getTime() - 10 * 60_000).toISOString();
    b.events = b.events.map((e) => ({ ...e, at: shift(e.at) }));
    b.searchingSince = shift(b.searchingSince!);
    await store.set(C.bookings, id, b);
    const view = (await call("GET", `/bookings/${id}`, { as: USERS.patient })).json.data;
    expect(view.status).toBe("Completed");
    expect(view.events.map((e: { state: string }) => e.state)).toEqual(["Requested", "Searching", "Accepted", "Assigned", "EnRoute", "Arrived", "Completed"]);
  });

  it("cancels until arrival only", async () => {
    const { call } = await makeApp();
    const id = (await call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": key() } })).json.data.id;
    const r = await call("POST", `/bookings/${id}/cancel`, { as: USERS.patient, body: {} });
    expect(r.json.data.status).toBe("Cancelled");
    expect((await call("POST", `/bookings/${id}/cancel`, { as: USERS.patient, body: {} })).status).toBe(409);
  });
});

describe("hospital portal", () => {
  it("rejects stale availability updates with 409 and stamps server time", async () => {
    const { call } = await makeApp();
    const cur = (await call("GET", "/hospital/availability", { as: USERS.hospitalStaff })).json.data.current;
    const body = { icuBeds: cur.icuBeds, emergencyBeds: cur.emergencyBeds, ventilators: cur.ventilators, servicesNow: cur.servicesNow, expectedVersion: cur.version };
    const ok = await call("PUT", "/hospital/availability", { as: USERS.hospitalStaff, body });
    expect(ok.status).toBe(200);
    expect(ok.json.data.current.tier).toBe("confirmed");
    expect(Math.abs(new Date(ok.json.data.current.updatedAt).getTime() - Date.now())).toBeLessThan(5000);
    const stale = await call("PUT", "/hospital/availability", { as: USERS.hospitalAdmin, body });
    expect(stale.status).toBe(409);
  });

  it("rejects counts above capacity", async () => {
    const { call } = await makeApp();
    const r = await call("PUT", "/hospital/availability", {
      as: USERS.hospitalStaff,
      body: { icuBeds: { available: 50, total: 10 }, emergencyBeds: { available: 1, total: 2 }, ventilators: { available: 0, total: 1 }, servicesNow: { ct: true, cathLab: false, specialistOnDuty: true }, expectedVersion: 3 },
    });
    expect(r.status).toBe(400);
  });

  it("keeps staff out of admin-only sections", async () => {
    const { call } = await makeApp();
    expect((await call("GET", "/hospital/staff", { as: USERS.hospitalStaff })).status).toBe(403);
    expect((await call("POST", "/hospital/verification", { as: USERS.hospitalStaff, body: { documents: [{ name: "x", contentType: "image/png", dataUrl: "data:image/png;base64,AA==" }] } })).status).toBe(403);
    expect((await call("GET", "/hospital/staff", { as: USERS.hospitalAdmin })).status).toBe(200);
    expect((await call("GET", "/hospital/dashboard", { as: USERS.patient })).status).toBe(403);
  });

  it("hides patient contact from staff without permission and blocks double handling", async () => {
    const { call } = await makeApp();
    await call("POST", "/emergency/requests", {
      body: { hospitalId: "h-001", category: "cardiac", lat: 28.47, lng: 77.5, etaMinutes: 9, consent: { location: true, shareDetails: true }, contact: { name: "Ravi", phone: "9876543210" } },
    });
    const staff = (await call("GET", "/hospital/requests", { as: USERS.hospitalStaff })).json.data;
    expect(staff.items[0].contact).toBeNull();
    const adminView = (await call("GET", "/hospital/requests", { as: USERS.hospitalAdmin })).json.data;
    expect(adminView.items[0].contact.phone).toBe("+919876543210");
    const id = staff.items[0].id;
    expect((await call("POST", `/hospital/requests/${id}/respond`, { as: USERS.hospitalStaff, body: { action: "decline" } })).status).toBe(400);
    expect((await call("POST", `/hospital/requests/${id}/respond`, { as: USERS.hospitalStaff, body: { action: "accept" } })).status).toBe(200);
    expect((await call("POST", `/hospital/requests/${id}/respond`, { as: USERS.hospitalAdmin, body: { action: "accept" } })).status).toBe(409);
  });
});

describe("reviews", () => {
  it("keeps new reviews pending and blocks a second review within 30 days", async () => {
    const { call } = await makeApp();
    const text = "The emergency staff were quick and kind to my mother today.";
    const created = await call("POST", "/reviews", { as: USERS.patient, body: { hospitalId: "h-010", rating: 4, text } });
    expect(created.json.data.status).toBe("pending");
    const pub = await call("GET", "/reviews?hospitalId=h-010");
    expect(pub.json.data.items.find((r: { id: string }) => r.id === created.json.data.id)).toBeUndefined();
    const dupe = await call("POST", "/reviews", { as: USERS.patient, body: { hospitalId: "h-003", rating: 2, text } });
    expect(dupe.status).toBe(422);
    expect(dupe.json.error!.details![0]!.issue).toBe("duplicate_review");
  });
});

describe("admin", () => {
  it("rejects ranking weights that do not sum to 1.00 and audits valid changes", async () => {
    const { call, store } = await makeApp();
    const cfg = (await call("GET", "/admin/config", { as: USERS.admin })).json.data;
    const bad = await call("PUT", "/admin/config", { as: USERS.admin, body: { ...cfg, weights: { ...cfg.weights, travel: 0.5 } } });
    expect(bad.status).toBe(422);
    expect(bad.json.error!.code).toBe("RULE_VIOLATION");
    const good = await call("PUT", "/admin/config", { as: USERS.admin, body: { ...cfg, weights: { ...cfg.weights, travel: 0.25, distance: 0.2 } } });
    expect(good.status).toBe(200);
    const logs = await store.query<AuditDoc>(C.auditLogs, { where: [["action", "==", "config.update"]] });
    expect(logs.some((l) => (l.after as { weights: { travel: number } }).weights.travel === 0.25)).toBe(true);
  });

  it("requires a reason to reject and stamps approval", async () => {
    const { call } = await makeApp();
    const pending = (await call("GET", "/admin/hospitals?status=pending", { as: USERS.admin })).json.data.items[0];
    const checklist = { registrationCertificate: true, addressMatch: true, phoneVerified: true, facilityEvidence: true };
    expect((await call("POST", `/admin/hospitals/${pending.id}/verify`, { as: USERS.admin, body: { decision: "reject", checklist } })).status).toBe(400);
    const ok = await call("POST", `/admin/hospitals/${pending.id}/verify`, { as: USERS.admin, body: { decision: "approve", checklist } });
    expect(ok.status).toBe(200);
    const detail = (await call("GET", `/admin/hospitals/${pending.id}`, { as: USERS.admin })).json.data;
    expect(detail.hospital.verifiedBy).toBe(USERS.admin);
    expect(detail.hospital.verifiedAt).not.toBeNull();
    expect(detail.auditTrail[0].action).toBe("hospital.verify.approve");
  });

  it("is closed to every other role", async () => {
    const { call } = await makeApp();
    for (const u of [USERS.patient, USERS.hospitalAdmin, USERS.dispatcher, USERS.driver]) {
      expect((await call("GET", "/admin/overview", { as: u })).status).toBe(403);
    }
    expect((await call("GET", "/admin/overview")).status).toBe(401);
  });

  it("stops suspended providers receiving new requests", async () => {
    const { call, store } = await makeApp();
    await call("POST", "/admin/providers/p-manual/decision", { as: USERS.admin, body: { decision: "suspend", reason: "Expired licence" } });
    const id = (await call("POST", "/bookings", { as: USERS.patient, body: bookingBody(), headers: { "idempotency-key": key() } })).json.data.id;
    const b = await store.get<BookingDoc>(C.bookings, id);
    expect(b!.candidateProviderIds).not.toContain("p-manual");
  });
});

describe("jobs", () => {
  it("require the cron secret", async () => {
    const { call } = await makeApp();
    expect((await call("POST", "/jobs/demo-ticker")).status).toBe(401);
    expect((await call("POST", "/jobs/demo-ticker", { headers: { authorization: "Bearer test-cron-secret" } })).status).toBe(200);
  });
});
