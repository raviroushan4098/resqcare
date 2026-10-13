"use client";

import { useTranslations } from "next-intl";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import type { Tier } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Count / total with tier and time. Missing data shows "Unknown", never zero. */
export function AvailabilityMeter({
  label,
  count,
  total,
  tier,
  updatedAt,
  source,
}: {
  label: string;
  count: number | null;
  total: number | null;
  tier: Tier;
  updatedAt: string | null;
  source?: string | null;
}) {
  const t = useTranslations("availability");
  const known = count !== null && tier !== "unknown";
  const pct = known && total ? Math.min(100, Math.round((count! / total) * 100)) : 0;
  return (
    <div className="space-y-2 rounded-card border border-border bg-surface p-4">
      <p className="font-semibold">{label}</p>
      {known ? (
        <>
          <p className="text-2xl font-bold">
            {t("countOfTotal", { count: count!, total: total ?? "?" })}
          </p>
          <div
            role="meter"
            aria-label={label}
            aria-valuenow={count!}
            aria-valuemin={0}
            aria-valuemax={total ?? count!}
            aria-valuetext={t("countOfTotal", { count: count!, total: total ?? "?" })}
            className="h-2 w-full overflow-hidden rounded-full bg-bg"
          >
            <div className={cn("h-full", tier === "confirmed" ? "bg-confirmed" : "bg-reported")} style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <p className="text-2xl font-bold text-muted">{t("unknown")}</p>
      )}
      <ConfidenceBadge tier={known ? tier : "unknown"} updatedAt={known ? updatedAt : null} size="sm" />
      {known && tier !== "confirmed" ? <p className="text-sm font-medium text-reported-text">{t("callToConfirm")}</p> : null}
      {known && source ? <p className="text-xs text-muted">{t("source", { source: t(`sources.${source}` as "sources.hospital") })}</p> : null}
    </div>
  );
}
