import { MemoryStore } from "@/server/db/memoryStore";
import { setStore } from "@/server/db";
import { createRouter } from "@/server/http/router";
import { routes } from "@/server/routes";
import { seedStore } from "@/server/seed/seed";
import { invalidateHospitalCache } from "@/server/services/hospitalService";

export const USERS = {
  patient: "u_patient_demo",
  hospitalAdmin: "u_hadmin_demo",
  hospitalStaff: "u_hstaff_demo",
  dispatcher: "u_dispatch_demo",
  driver: "u_driver_demo",
  driver2: "u_driver_demo2",
  admin: "u_admin_demo",
} as const;

/** Fresh seeded in-memory backend plus a helper that calls the real router. */
export async function makeApp(now = new Date()) {
  const store = new MemoryStore();
  await seedStore(store, now);
  setStore(store);
  invalidateHospitalCache();
  const handle = createRouter(routes);
  async function call<T = any>(
    method: string,
    path: string,
    opts: { body?: unknown; as?: string; headers?: Record<string, string>; scenario?: string } = {},
  ): Promise<{ status: number; json: { ok: boolean; data: T; error?: { code: string; message: string; details?: { path: string; issue: string }[] }; meta: Record<string, unknown> } }> {
    const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
    if (opts.as) headers.authorization = `Bearer demo.${opts.as}`;
    if (opts.scenario) headers.cookie = `rq-scenario=${opts.scenario}`;
    const req = new Request(`http://localhost/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    const res = await handle(req, path.split("?")[0]!);
    return { status: res.status, json: await res.json() };
  }
  return { store, call };
}

export const bookingBody = (over: Record<string, unknown> = {}) => ({
  pickup: { lat: 28.47, lng: 77.5, consent: true },
  destinationHospitalId: null,
  type: "basic",
  contact: { name: "Test Person", phone: "9876543210" },
  patientCount: 1,
  ...over,
});
