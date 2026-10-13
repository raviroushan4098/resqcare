import "server-only";
import { env } from "../config/env";
import { seedStore } from "../seed/seed";
import { MemoryStore } from "./memoryStore";
import type { DocStore } from "./store";

type Holder = { store?: DocStore; ready?: Promise<DocStore> };
// globalThis keeps one store across Next.js dev hot reloads and route bundles.
const holder = ((globalThis as unknown as { __rqStore?: Holder }).__rqStore ??= {});

export async function getStore(): Promise<DocStore> {
  if (holder.store) return holder.store;
  holder.ready ??= (async () => {
    if (env().DATA_BACKEND === "firestore") {
      const [{ FirestoreStore }, { adminDb }] = await Promise.all([import("./firestoreStore"), import("../firebase/admin")]);
      holder.store = new FirestoreStore(adminDb());
    } else {
      const mem = new MemoryStore();
      await seedStore(mem, new Date(), { demoModeDefault: env().DEMO_MODE_DEFAULT });
      holder.store = mem;
    }
    return holder.store;
  })();
  return holder.ready;
}

/** Tests inject a fresh store. */
export function setStore(store: DocStore | undefined) {
  holder.store = store;
  holder.ready = store ? Promise.resolve(store) : undefined;
}
