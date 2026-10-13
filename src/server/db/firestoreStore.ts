import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type Firestore, type Query as FsQuery } from "firebase-admin/firestore";
import { StoreConflict, StoreNotFound, type DocStore, type Query, type Tx } from "./store";

/** Firestore Timestamps come back as ISO strings so both stores look the same. */
function fromFs(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(fromFs);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromFs(x)]));
  return v;
}

/** `expiresAt` is stored as a Timestamp so TTL policies work. */
function toFs(data: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[k] = k === "expiresAt" && typeof v === "string" ? Timestamp.fromDate(new Date(v)) : v;
  }
  return out;
}

function build(db: Firestore, path: string, q: Query = {}): FsQuery {
  let ref: FsQuery = db.collection(path);
  for (const [f, op, v] of q.where ?? []) ref = ref.where(f, op, v);
  for (const [f, dir] of q.orderBy ?? []) ref = ref.orderBy(f, dir);
  if (q.offset) ref = ref.offset(q.offset);
  if (q.limit !== undefined) ref = ref.limit(q.limit);
  return ref;
}

export class FirestoreStore implements DocStore {
  readonly kind = "firestore" as const;
  constructor(private db: Firestore) {}

  async get<T>(path: string, id: string) {
    const snap = await this.db.collection(path).doc(id).get();
    return snap.exists ? (fromFs(snap.data()) as T) : null;
  }
  async set(path: string, id: string, data: object) {
    await this.db.collection(path).doc(id).set(toFs(data));
  }
  async create(path: string, id: string, data: object) {
    try {
      await this.db.collection(path).doc(id).create(toFs(data));
    } catch (e) {
      if ((e as { code?: number }).code === 6) throw new StoreConflict(`${path}/${id} exists`);
      throw e;
    }
  }
  async update(path: string, id: string, patch: object) {
    try {
      await this.db.collection(path).doc(id).update(toFs(patch));
    } catch (e) {
      if ((e as { code?: number }).code === 5) throw new StoreNotFound(`${path}/${id}`);
      throw e;
    }
  }
  async delete(path: string, id: string) {
    await this.db.collection(path).doc(id).delete();
  }
  async query<T>(path: string, q?: Query) {
    const snap = await build(this.db, path, q).get();
    return snap.docs.map((d) => fromFs(d.data()) as T);
  }
  async count(path: string, q?: Query) {
    const snap = await build(this.db, path, { where: q?.where }).count().get();
    return snap.data().count;
  }
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    return this.db.runTransaction(async (t) => {
      const tx: Tx = {
        get: async (p, id) => {
          const s = await t.get(this.db.collection(p).doc(id));
          return s.exists ? (fromFs(s.data()) as never) : null;
        },
        query: async (p, q) => (await t.get(build(this.db, p, q))).docs.map((d) => fromFs(d.data()) as never),
        set: (p, id, d) => void t.set(this.db.collection(p).doc(id), toFs(d)),
        update: (p, id, patch) => void t.update(this.db.collection(p).doc(id), toFs(patch) as never),
        delete: (p, id) => void t.delete(this.db.collection(p).doc(id)),
      };
      return fn(tx);
    });
  }
  newId(prefix = "") {
    return `${prefix}${randomBytes(8).toString("hex")}`;
  }
}

export { FieldValue };
