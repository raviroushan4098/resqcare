"use client";

import { AlertOctagon, Lock, SearchX, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import type { ErrorCode } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { useApiErrorMessage } from "./apiErrorMessage";

/** Consistent error block: icon, plain message, retry, emergency numbers. Accepts an API error or a code. */
export function ErrorState({
  error,
  errorCode,
  title,
  onRetry,
  showEmergencyNumbers = true,
  className,
}: {
  error?: unknown;
  errorCode?: ErrorCode;
  title?: string;
  onRetry?: () => void;
  showEmergencyNumbers?: boolean;
  className?: string;
}) {
  const t = useTranslations("errors");
  const msg = useApiErrorMessage();
  const code: ErrorCode = errorCode ?? (isApiError(error) ? error.code : "INTERNAL");
  const Icon = code === "NETWORK_ERROR" ? WifiOff : code === "FORBIDDEN" ? Lock : code === "NOT_FOUND" ? SearchX : AlertOctagon;
  const message = error ? msg(error) : t(code, { requestId: "-", seconds: 30 });
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-6 text-center", className)}>
      <Icon aria-hidden="true" className="h-10 w-10 text-emergency" />
      <h2 className="text-lg font-semibold">{title ?? t("title")}</h2>
      <p className="max-w-prose">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
      {showEmergencyNumbers ? <InlineEmergencyNumbers className="justify-center" /> : null}
    </div>
  );
}
