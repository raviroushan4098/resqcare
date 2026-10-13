import { randomBytes } from "node:crypto";
import { applyQuery, StoreConflict, StoreNotFound, type DocStore, type Query, type Tx } from "./store";

const clone = <T,>(v: T): T => structuredClone(v);

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    // Dotted keys behave like Firestore field paths.
    if (k.includes(".")) {
      const parts = k.split(".");
      let o = target;
      for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
      o[parts.at(-1)!] = v;
    } else target[k] = v;
  }
}

export class MemoryStore implements DocStore {
  readonly kind = "memory" as const;
  private cols = new Map<string, Map<string, Record<string, unknown>>>();
  private lock: Promise<unknown> = Promise.resolve();

  private col(path: string) {
    let c = this.cols.get(path);
    if (!c) this.cols.set(path, (c = new Map()));
    return c;
  }

  async get<T>(path: string, id: string) {
    const d = this.col(path).get(id);
    return d ? (clone(d) as T) : null;
  }
  async set(path: string, id: string, data: object) {
    this.col(path).set(id, clone({ ...data }) as Record<string, unknown>);
  }
  async create(path: string, id: string, data: object) {
    if (this.col(path).has(id)) throw new StoreConflict(`${path}/${id} exists`);
    await this.set(path, id, data);
  }
  async update(path: string, id: string, patch: object) {
    const d = this.col(path).get(id);
    if (!d) throw new StoreNotFound(`${path}/${id}`);
    deepMerge(d, clone(patch) as Record<string, unknown>);
  }
  async delete(path: string, id: string) {
    this.col(path).delete(id);
  }
  async query<T>(path: string, q?: Query) {
    return applyQuery([...this.col(path).values()], q).map((d) => clone(d) as T);
  }
  async count(path: string, q?: Query) {
    return applyQuery([...this.col(path).values()], { where: q?.where }).length;
  }

  /** Transactions run one at a time, so read-validate-write is atomic. */
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    const run = async () => {
      const writes: (() => void)[] = [];
      const tx: Tx = {
        get: (p, id) => this.get(p, id),
        query: (p, q) => this.query(p, q),
        set: (p, id, d) => void writes.push(() => this.col(p).set(id, clone({ ...d }) as Record<string, unknown>)),
        update: (p, id, patch) =>
          void writes.push(() => {
            const d = this.col(p).get(id);
            if (!d) throw new StoreNotFound(`${p}/${id}`);
            deepMerge(d, clone(patch) as Record<string, unknown>);
          }),
        delete: (p, id) => void writes.push(() => this.col(p).delete(id)),
      };
      const result = await fn(tx);
      for (const w of writes) w();
      return result;
    };
    const next = this.lock.then(run, run);
    this.lock = next.catch(() => undefined);
    return next;
  }

  newId(prefix = "") {
    return `${prefix}${randomBytes(8).toString("hex")}`;
  }

  /** Test helper. */
  dump(path: string) {
    return [...this.col(path).values()];
  }
}
