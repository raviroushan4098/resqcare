/**
 * Runs core API flows against FirestoreStore in the emulator, so every query
 * the services issue is checked against real Firestore semantics.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { setStore } from "@/server/db";
import { FirestoreStore } from "@/server/db/firestoreStore";
import { createRouter } from "@/server/http/router";
import { routes } from "@/server/routes";
import { seedStore } from "@/server/seed/seed";
import { invalidateHospitalCache } from "@/server/services/hospitalService";

const handle = createRouter(routes);
async function call(method: string, path: string, opts: { as?: string; body?: unknown; key?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.as) headers.authorization = `Bearer demo.${opts.as}`;
  if (opts.key) headers["idempotency-key"] = opts.key;
  const res = await handle(new Request(`http://localhost/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }), path.split("?")[0]!);
  return { status: res.status, json: (await res.json()) as { data: any; error?: { code: string } } };
}
const booking = { pickup: { lat: 28.47, lng: 77.5, consent: true }, destinationHospitalId: null, type: "basic", contact: { name: "Emu Test", phone: "9000000002" }, patientCount: 1 };

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via pnpm test:rules (emulator required)");
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-resqcare" });
  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* already configured */
  }
  const store = new FirestoreStore(db);
  await seedStore(store, new Date());
  setStore(store);
  invalidateHospitalCache();
});

describe("FirestoreStore end to end (emulator)", () => {
  it("serves public config, directory and detail", async () => {
    expect((await call("GET", "/config/public")).status).toBe(200);
    const list = await call("GET", "/hospitals?limit=50");
    expect(list.json.data.total).toBeGreaterThan(30);
    expect((await call("GET", "/hospitals/h-001")).json.data.name).toContain("(fictional)");
    expect((await call("GET", "/reviews?hospitalId=h-003")).status).toBe(200);
  });

  it("runs the geohash search and capability gate", async () => {
    const r = await call("POST", "/emergency/search", { body: { category: "stroke", lat: 28.4744, lng: 77.504, radiusKm: 25 } });
    expect(r.status).toBe(200);
    expect(r.json.data.results.length).toBeGreaterThan(0);
  });

  it("creates one booking per idempotency key and serialises vehicle assignment", async () => {
    await call("PUT", "/admin/demo", { as: "u_admin_demo", body: { demoMode: true, simulateDispatch: false, acceptDelaySec: 8, stepDelaySec: 6 } });
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      call("POST", "/bookings", { as: "u_patient_demo", body: booking, key }),
      call("POST", "/bookings", { as: "u_patient_demo", body: booking, key }),
    ]);
    expect(a.json.data.id).toBe(b.json.data.id);
    const b2 = (await call("POST", "/bookings", { as: "u_patient_demo", body: booking, key: crypto.randomUUID() })).json.data.id;
    const q = await call("GET", "/provider/requests", { as: "u_dispatch_demo" });
    expect(q.status).toBe(200);
    expect(q.json.data.incoming.length).toBeGreaterThanOrEqual(2);
    await call("POST", `/provider/bookings/${a.json.data.id}/accept`, { as: "u_dispatch_demo" });
    await call("POST", `/provider/bookings/${b2}/accept`, { as: "u_dispatch_demo" });
    const [r1, r2] = await Promise.all([
      call("POST", `/provider/bookings/${a.json.data.id}/assign`, { as: "u_dispatch_demo", body: { ambulanceId: "a-man-1", driverId: "u_driver_demo" } }),
      call("POST", `/provider/bookings/${b2}/assign`, { as: "u_dispatch_demo", body: { ambulanceId: "a-man-1", driverId: "u_driver_demo" } }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const drv = await call("GET", "/driver/assignment", { as: "u_driver_demo" });
    expect(drv.json.data.assignment.status).toBe("Assigned");
  });

  it("serves portal, admin and analytics queries", async () => {
    for (const [path, as] of [
      ["/hospital/dashboard", "u_hadmin_demo"],
      ["/hospital/requests", "u_hstaff_demo"],
      ["/hospital/availability/history", "u_hstaff_demo"],
      ["/hospital/audit-logs", "u_hadmin_demo"],
      ["/admin/overview", "u_admin_demo"],
      ["/admin/hospitals", "u_admin_demo"],
      ["/admin/providers", "u_admin_demo"],
      ["/admin/analytics", "u_admin_demo"],
      ["/admin/reviews", "u_admin_demo"],
      ["/admin/flags?status=open", "u_admin_demo"],
      ["/bookings", "u_patient_demo"],
    ] as const) {
      const r = await call("GET", path, { as });
      expect(r.status, `${path}: ${JSON.stringify(r.json.error)}`).toBe(200);
    }
  });

  it("runs every scheduled job", async () => {
    for (const job of ["freshness-sweep", "demo-ticker", "booking-timeout", "retention-cleanup"]) {
      const res = await handle(new Request(`http://localhost/api/jobs/${job}`, { method: "POST", headers: { authorization: "Bearer test-cron-secret" } }), `/jobs/${job}`);
      expect(res.status, job).toBe(200);
    }
  });
});
