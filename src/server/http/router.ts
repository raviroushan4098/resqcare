import "server-only";
import { randomBytes } from "node:crypto";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import type { Degraded } from "@/lib/schemas";
import { env } from "../config/env";
import { authorize, type Action } from "../auth/policies";
import type { AuthUser } from "../auth/roles";
import { verifyRequestUser } from "../auth/verifyToken";
import { getStore } from "../db";
import type { DocStore } from "../db/store";
import { StoreConflict, StoreNotFound } from "../db/store";
import { AppError, unauthenticated } from "../errors/AppError";
import { clientIp, enforceRateLimit, hashIp } from "./rateLimit";
import { readScenario, type Scenario } from "./scenario";

export interface Ctx<B = unknown, Q = unknown> {
  req: Request;
  requestId: string;
  user: AuthUser | null;
  store: DocStore;
  params: Record<string, string>;
  body: B;
  query: Q;
  ipHash: string;
  scenario: Scenario;
  now: Date;
  /** Services add "ai" or "maps" here when they fall back. */
  degraded: Set<Degraded>;
  meta: { nextCursor?: string | null };
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteDef<B = unknown, Q = unknown> {
  method: Method;
  path: string;
  /** public: no token needed; optional: token used if present; required: 401 without one. */
  auth: "public" | "optional" | "required";
  /** Coarse policy check before the handler (resource-level checks happen in services). */
  action?: Action;
  body?: ZodType<B, ZodTypeDef, unknown>;
  query?: ZodType<Q, ZodTypeDef, unknown>;
  rateLimit?: { bucket: string; limit: number; windowSec: number; by: "ip" | "user" };
  /** Scheduled jobs: requires `Authorization: Bearer $CRON_SECRET`. */
  cron?: boolean;
  status?: number;
  handler: (ctx: Ctx<B, Q>) => Promise<unknown>;
}

export const defineRoute = <B = unknown, Q = unknown>(def: RouteDef<B, Q>) => def as unknown as RouteDef;

interface Compiled {
  def: RouteDef;
  re: RegExp;
  keys: string[];
}

function compile(def: RouteDef): Compiled {
  const keys: string[] = [];
  const re = new RegExp(
    `^${def.path.replace(/\/:([a-zA-Z]+)/g, (_, k) => {
      keys.push(k);
      return "/([^/]+)";
    })}/?$`,
  );
  return { def, re, keys };
}

const rid = () => `req_${randomBytes(5).toString("hex")}`;

function zodDetails(e: ZodError) {
  return e.issues.map((i) => ({ path: i.path.join(".") || "body", issue: i.message }));
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function log(entry: Record<string, unknown>) {
  if (env().NODE_ENV === "test") return;
  // Structured, no tokens, phone numbers or free text.
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`);
}

export function createRouter(defs: RouteDef[]) {
  const routes = defs.map(compile);

  return async function handle(req: Request, pathname: string): Promise<Response> {
    const started = Date.now();
    const requestId = rid();
    const method = req.method.toUpperCase();
    let routePath = "unmatched";
    try {
      const candidates = routes.filter((r) => r.re.test(pathname));
      const route = candidates.find((r) => r.def.method === method);
      if (!route) {
        if (candidates.length) throw new AppError("NOT_FOUND", `Method ${method} not allowed`);
        throw new AppError("NOT_FOUND", "Endpoint not found");
      }
      const { def } = route;
      routePath = def.path;
      const m = route.re.exec(pathname)!;
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
      const store = await getStore();
      const scenario = readScenario(req);
      const now = new Date();

      if (scenario === "slow") await new Promise((r) => setTimeout(r, 3000));
      if (scenario === "rate-limited" && def.path !== "/config/public" && def.path !== "/health") {
        throw new AppError("RATE_LIMITED", "Too many requests", { headers: { "Retry-After": "30" } });
      }

      if (def.cron) {
        const secret = env().CRON_SECRET;
        const header = req.headers.get("authorization");
        const allowed = secret ? header === `Bearer ${secret}` : env().NODE_ENV !== "production";
        if (!allowed) throw unauthenticated();
      }

      const user = def.auth === "public" || def.cron ? null : await verifyRequestUser(req.headers.get("authorization"), store);
      if (def.auth === "required" && !user) throw unauthenticated();
      if (scenario === "forbidden" && def.auth === "required") throw new AppError("FORBIDDEN", "Forbidden (dev scenario)");
      if (def.action) authorize(user, def.action);

      const ipHash = hashIp(clientIp(req));
      if (def.rateLimit) {
        const key = def.rateLimit.by === "user" && user ? `u:${user.uid}` : `ip:${ipHash}`;
        await enforceRateLimit(store, { ...def.rateLimit, key }, now);
      }

      const url = new URL(req.url);
      const rawQuery = Object.fromEntries(url.searchParams.entries());
      const query = def.query ? def.query.parse(rawQuery) : rawQuery;

      let body: unknown = undefined;
      if (def.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new AppError("VALIDATION_FAILED", "Request body must be JSON", { details: [{ path: "body", issue: "invalid_json" }] });
        }
        body = def.body.parse(raw);
      }

      const ctx: Ctx = { req, requestId, user, store, params, body, query, ipHash, scenario, now, degraded: new Set(), meta: {} };
      const data = await def.handler(ctx);
      const status = def.status ?? 200;
      log({ requestId, method, route: routePath, status, ms: Date.now() - started });
      return json(
        {
          ok: true,
          data: data ?? null,
          meta: {
            requestId,
            ...(ctx.degraded.size ? { degraded: [...ctx.degraded] } : {}),
            ...(ctx.meta.nextCursor !== undefined ? { nextCursor: ctx.meta.nextCursor } : {}),
          },
        },
        status,
      );
    } catch (e) {
      let err: AppError;
      if (e instanceof AppError) err = e;
      else if (e instanceof ZodError) err = new AppError("VALIDATION_FAILED", "Invalid request", { details: zodDetails(e) });
      else if (e instanceof StoreConflict) err = new AppError("CONFLICT", "Resource already exists");
      else if (e instanceof StoreNotFound) err = new AppError("NOT_FOUND", "Resource not found");
      else {
        err = new AppError("INTERNAL", "Something went wrong");
        console.error(JSON.stringify({ requestId, route: routePath, error: (e as Error)?.message ?? String(e) }));
      }
      log({ requestId, method, route: routePath, status: err.status, code: err.code, ms: Date.now() - started });
      return json(
        { ok: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }, meta: { requestId } },
        err.status,
        err.headers,
      );
    }
  };
}
