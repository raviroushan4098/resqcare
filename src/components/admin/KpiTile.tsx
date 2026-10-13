"use client";

import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";

export function KpiTile({
  label,
  value,
  unit,
  definition,
  trend,
  loading,
  error,
}: {
  label: string;
  value: number | null;
  unit?: string;
  definition: string;
  trend?: "up" | "down" | null;
  loading?: boolean;
  error?: boolean;
}) {
  const t = useTranslations("admin.kpi");
  return (
    <Card className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <Tooltip content={definition}>
          <button type="button" className="rounded p-1" aria-label={t("definition", { label })}>
            <Info aria-hidden="true" className="h-4 w-4 text-muted" />
          </button>
        </Tooltip>
      </div>
      {loading ? (
        <div aria-hidden="true" className="h-9 w-24 animate-pulse rounded bg-[#e3eaf2]" />
      ) : error ? (
        <p className="text-sm font-medium text-emergency">{t("error")}</p>
      ) : (
        <p className="flex items-baseline gap-1 text-3xl font-bold">
          {value === null ? <span className="text-muted">{t("noData")}</span> : value}
          {value !== null && unit ? <span className="text-base font-medium text-muted">{unit}</span> : null}
          {trend === "up" ? <TrendingUp aria-label={t("up")} className="h-5 w-5 text-confirmed" /> : trend === "down" ? <TrendingDown aria-label={t("down")} className="h-5 w-5 text-emergency" /> : null}
        </p>
      )}
      <p className="text-xs text-muted">{definition}</p>
    </Card>
  );
}
