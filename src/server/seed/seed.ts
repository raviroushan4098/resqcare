import { C } from "../repositories/collections";
import type { DocStore } from "../db/store";
import { buildSeed, type SeedData } from "./data";

/** Writes the seed data set into any DocStore (memory on boot, Firestore via scripts/seed.ts). */
export async function seedStore(store: DocStore, now: Date, opts: { demoModeDefault?: boolean; onProgress?: (msg: string) => void } = {}) {
  const data: SeedData = buildSeed(now, opts);
  const groups: [string | ((d: never) => string), { id: string }[]][] = [
    [C.users, data.users],
    [C.hospitals, data.hospitals],
    [C.facilities, data.facilities],
    [C.availability, data.availability],
    [C.departments, data.departments],
    [C.specialists, data.specialists],
    [C.providers, data.providers],
    [C.ambulances, data.ambulances],
    [C.bookings, data.bookings],
    [C.reviews, data.reviews],
    [C.searchLogs, data.searchLogs],
    [C.flags, data.flags],
    [C.verifications, data.verifications],
    [C.applications, data.applications],
    [C.auditLogs, data.auditLogs],
    [C.config, data.config],
  ];
  for (const [path, docs] of groups) {
    await Promise.all(docs.map((d) => store.set(path as string, d.id, d)));
    opts.onProgress?.(`${path as string}: ${docs.length}`);
  }
  await Promise.all(
    data.availabilityHistory.map((h) => store.set(C.availabilityHistory(h.hospitalId), h.id, h)),
  );
  return data;
}
