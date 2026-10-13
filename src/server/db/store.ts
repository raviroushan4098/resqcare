/**
 * Minimal document-store interface the repositories use. Two implementations:
 * MemoryStore (seeded, zero-config demo and tests) and FirestoreStore (Admin SDK).
 * Timestamps are ISO strings on both; FirestoreStore writes `expiresAt` as a
 * Timestamp so Firestore TTL policies can act on it.
 */
export type WhereOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains";

export interface Query {
  where?: [field: string, op: WhereOp, value: unknown][];
  orderBy?: [field: string, dir: "asc" | "desc"][];
  limit?: number;
  offset?: number;
}

export interface Tx {
  get<T>(path: string, id: string): Promise<T | null>;
  query<T>(path: string, q: Query): Promise<T[]>;
  set(path: string, id: string, data: object): void;
  update(path: string, id: string, patch: object): void;
  delete(path: string, id: string): void;
}

export interface DocStore {
  readonly kind: "memory" | "firestore";
  get<T>(path: string, id: string): Promise<T | null>;
  set(path: string, id: string, data: object): Promise<void>;
  /** Throws StoreConflict if the document already exists. */
  create(path: string, id: string, data: object): Promise<void>;
  /** Throws StoreNotFound if the document does not exist. */
  update(path: string, id: string, patch: object): Promise<void>;
  delete(path: string, id: string): Promise<void>;
  query<T>(path: string, q?: Query): Promise<T[]>;
  count(path: string, q?: Query): Promise<number>;
  /** Serializable read-then-write. Reads must come before writes. */
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
  newId(prefix?: string): string;
}

export class StoreConflict extends Error {}
export class StoreNotFound extends Error {}

export function getField(doc: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), doc);
}

export function matches(doc: unknown, where: Query["where"] = []): boolean {
  return where.every(([field, op, value]) => {
    const v = getField(doc, field) as never;
    switch (op) {
      case "==": return v === value;
      case "!=": return v !== value;
      case "<": return v < (value as never);
      case "<=": return v <= (value as never);
      case ">": return v > (value as never);
      case ">=": return v >= (value as never);
      case "in": return (value as unknown[]).includes(v);
      case "array-contains": return Array.isArray(v) && (v as unknown[]).includes(value);
    }
  });
}

export function applyQuery<T>(docs: T[], q: Query = {}): T[] {
  let out = docs.filter((d) => matches(d, q.where));
  if (q.orderBy?.length) {
    out = [...out].sort((a, b) => {
      for (const [f, dir] of q.orderBy!) {
        const av = getField(a, f) as never;
        const bv = getField(b, f) as never;
        if (av === bv) continue;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        return (av < bv ? -1 : 1) * (dir === "asc" ? 1 : -1);
      }
      return 0;
    });
  }
  if (q.offset) out = out.slice(q.offset);
  if (q.limit !== undefined) out = out.slice(0, q.limit);
  return out;
}
