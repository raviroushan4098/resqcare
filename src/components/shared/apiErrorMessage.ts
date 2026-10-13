"use client";

import { useTranslations } from "next-intl";
import { isApiError } from "@/lib/api";

/** Maps any thrown error to a friendly localized message (Part C.5). Never shows raw error text. */
export function useApiErrorMessage() {
  const t = useTranslations("errors");
  return (e: unknown): string => {
    if (!isApiError(e)) return t("INTERNAL", { requestId: "-" });
    switch (e.code) {
      case "RATE_LIMITED":
        return t("RATE_LIMITED", { seconds: e.retryAfter ?? 30 });
      case "INTERNAL":
      case "CONTRACT_MISMATCH":
        return t(e.code, { requestId: e.requestId ?? "-" });
      default:
        return t(e.code);
    }
  };
}

/** Field-level messages for VALIDATION_FAILED (path -> issue). */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!isApiError(e) || e.code !== "VALIDATION_FAILED") return {};
  return Object.fromEntries(e.details.map((d) => [d.path, d.issue]));
}
