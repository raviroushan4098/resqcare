import type { ServerErrorCode } from "@/lib/schemas/common";

export const HTTP_STATUS: Record<ServerErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  UPSTREAM_FAILED: 502,
  UPSTREAM_TIMEOUT: 504,
  INTERNAL: 500,
};

export type ErrorDetail = { path: string; issue: string };

export class AppError extends Error {
  readonly code: ServerErrorCode;
  readonly details?: ErrorDetail[];
  readonly headers?: Record<string, string>;

  constructor(code: ServerErrorCode, message: string, opts: { details?: ErrorDetail[]; headers?: Record<string, string> } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = opts.details;
    this.headers = opts.headers;
  }

  get status() {
    return HTTP_STATUS[this.code];
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (msg = "You do not have permission for this action") => new AppError("FORBIDDEN", msg);
export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Sign in required");
export const conflict = (msg: string, details?: ErrorDetail[]) => new AppError("CONFLICT", msg, { details });
export const ruleViolation = (msg: string, details?: ErrorDetail[]) => new AppError("RULE_VIOLATION", msg, { details });
