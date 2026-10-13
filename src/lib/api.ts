import type { ZodType } from "zod";
import { ErrEnvelopeSchema, OkEnvelopeBaseSchema, type ErrorCode, type Meta } from "./schemas/common";
import { getScenario } from "./devScenario";
import { markSynced } from "./sync";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: { path: string; issue: string }[];
  /** Seconds to wait before retrying, from the Retry-After header. */
  readonly retryAfter: number | null;

  constructor(init: {
    code: ErrorCode;
    message: string;
    status: number;
    requestId?: string | null;
    details?: { path: string; issue: string }[];
    retryAfter?: number | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId ?? null;
    this.details = init.details ?? [];
    this.retryAfter = init.retryAfter ?? null;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export type ApiResult<T> = { data: T; meta: Meta };

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions<T> {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Validates `data`; a mismatch throws CONTRACT_MISMATCH. */
  schema?: ZodType<T>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skip the auth header (public endpoints). */
  anonymous?: boolean;
}

type TokenProvider = () => Promise<string | null>;

const settings = {
  tokenProvider: (async () => null) as TokenProvider,
  /** Base delay for GET retries; doubled each attempt. */
  retryBaseMs: 400,
  maxGetRetries: 2,
};

export function configureApi(next: Partial<typeof settings>) {
  Object.assign(settings, next);
}

function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return `${origin}/api`;
}

function buildUrl(path: string, query?: RequestOptions<unknown>["query"]): string {
  const url = new URL(apiBase() + (path.startsWith("/") ? path : `/${path}`));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function isRetryable(err: ApiError): boolean {
  return (
    err.code === "NETWORK_ERROR" ||
    err.code === "UPSTREAM_TIMEOUT" ||
    err.code === "UPSTREAM_FAILED" ||
    (err.status >= 500 && err.code !== "CONTRACT_MISMATCH")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once<T>(path: string, opts: RequestOptions<T>): Promise<ApiResult<T>> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  if (!opts.anonymous) {
    const token = await settings.tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  if (getScenario() === "offline") {
    throw new ApiError({ code: "NETWORK_ERROR", message: "Offline (dev scenario)", status: 0 });
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError({ code: "NETWORK_ERROR", message: "Network request failed", status: 0 });
  }

  const retryAfterHeader = res.headers.get("Retry-After");
  const retryAfter = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError({
      code: res.ok ? "CONTRACT_MISMATCH" : "INTERNAL",
      message: "Response was not valid JSON",
      status: res.status,
      retryAfter,
    });
  }

  const err = ErrEnvelopeSchema.safeParse(json);
  if (err.success) {
    throw new ApiError({
      code: err.data.error.code,
      message: err.data.error.message,
      details: err.data.error.details,
      requestId: err.data.meta.requestId,
      status: res.status,
      retryAfter,
    });
  }

  const ok = OkEnvelopeBaseSchema.safeParse(json);
  if (!ok.success || !res.ok) {
    throw new ApiError({ code: "CONTRACT_MISMATCH", message: "Unexpected response envelope", status: res.status });
  }

  let data = ok.data.data as T;
  if (opts.schema) {
    const parsed = opts.schema.safeParse(ok.data.data);
    if (!parsed.success) {
      throw new ApiError({
        code: "CONTRACT_MISMATCH",
        message: "Response data did not match schema",
        status: res.status,
        requestId: ok.data.meta.requestId,
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), issue: i.message })),
      });
    }
    data = parsed.data;
  }

  markSynced();
  return { data, meta: ok.data.meta };
}

/**
 * Typed request against the backend envelope. GETs are retried twice with
 * exponential backoff on network and 5xx failures; writes are never retried
 * here (callers retry with the same idempotency key).
 */
export async function request<T>(path: string, opts: RequestOptions<T> = {}): Promise<ApiResult<T>> {
  const method = opts.method ?? "GET";
  const attempts = method === "GET" ? settings.maxGetRetries + 1 : 1;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await once(path, opts);
    } catch (e) {
      lastError = e;
      if (!(e instanceof ApiError) || !isRetryable(e) || i === attempts - 1) throw e;
      await sleep(settings.retryBaseMs * 2 ** i);
    }
  }
  throw lastError;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions<T>, "method" | "body">) => request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions<T>, "method" | "body">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions<T>, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions<T>, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions<T>, "method" | "body">) => request<T>(path, { ...opts, method: "DELETE" }),
};

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
