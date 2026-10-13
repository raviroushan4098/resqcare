import { createHash } from "node:crypto";
import { env } from "../config/env";
import type { DocStore } from "../db/store";
import { AppError } from "../errors/AppError";
import { C } from "../repositories/collections";

export function hashIp(ip: string) {
  return createHash("sha256").update(`${env().RATE_LIMIT_SALT ?? "dev-salt"}:${ip}`).digest("hex").slice(0, 24);
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/**
 * Fixed-window counter stored in `rateLimits` (TTL on expiresAt). The same
 * code runs on the memory store and Firestore, so limits hold across instances
 * in production.
 */
export async function enforceRateLimit(
  store: DocStore,
  opts: { bucket: string; key: string; limit: number; windowSec: number },
  now: Date,
) {
  const windowStart = Math.floor(now.getTime() / (opts.windowSec * 1000)) * opts.windowSec * 1000;
  const id = `${opts.bucket}_${opts.key}_${windowStart}`;
  const count = await store.transaction(async (tx) => {
    const doc = await tx.get<{ count: number }>(C.rateLimits, id);
    const next = (doc?.count ?? 0) + 1;
    tx.set(C.rateLimits, id, {
      id,
      count: next,
      expiresAt: new Date(windowStart + opts.windowSec * 2000).toISOString(),
    });
    return next;
  });
  if (count > opts.limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + opts.windowSec * 1000 - now.getTime()) / 1000));
    throw new AppError("RATE_LIMITED", "Too many requests", { headers: { "Retry-After": String(retryAfter) } });
  }
}
