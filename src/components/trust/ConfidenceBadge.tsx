"use client";

import { CheckCircle2, Clock, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Tooltip } from "@/components/ui/tooltip";
import { useAppLocale } from "@/hooks/useAppLocale";
import { formatRelative } from "@/lib/format";
import type { Tier } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const STYLE: Record<Tier, { icon: typeof CheckCircle2; cls: string }> = {
  confirmed: { icon: CheckCircle2, cls: "border-confirmed text-confirmed bg-tint-confirmed" },
  reported: { icon: Clock, cls: "border-reported text-reported-text bg-tint-reported" },
  unknown: { icon: HelpCircle, cls: "border-unknown text-unknown bg-tint-unknown" },
};

/**
 * Confirmed / Reported / Unknown with icon + text (never colour alone) and the
 * last-updated time. Screen readers hear e.g. "Confirmed, updated 2 hours ago".
 */
export function ConfidenceBadge({
  tier,
  updatedAt,
  windowLabel,
  size = "md",
  label,
  className,
}: {
  tier: Tier;
  updatedAt?: string | null;
  /** e.g. "60 minutes": the freshness window, shown in the tooltip. */
  windowLabel?: string;
  size?: "sm" | "md";
  /** What the badge describes, e.g. "CT scan". Prepended for screen readers. */
  label?: string;
  className?: string;
}) {
  const t = useTranslations("confidence");
  const locale = useAppLocale();
  const s = STYLE[tier];
  const Icon = s.icon;
  const text = t(`${tier}.label`);
  const srText = [label, text, updatedAt ? t("updated", { time: formatRelative(updatedAt, locale) }) : tier === "unknown" ? null : t("noTime")]
    .filter(Boolean)
    .join(", ");
  return (
    <Tooltip content={windowLabel ? t(`${tier}.help`, { window: windowLabel }) : t(`${tier}.helpShort`)}>
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full cursor-default items-center gap-1 rounded-full border font-medium",
          size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
          s.cls,
          className,
        )}
      >
        <span className="sr-only">{srText}</span>
        <Icon aria-hidden="true" className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        <span aria-hidden="true" className="truncate">
          {label ? `${label}: ` : ""}
          {text}
        </span>
        {updatedAt ? (
          <span aria-hidden="true" className="whitespace-nowrap font-normal">
            · <RelativeTime iso={updatedAt} />
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}
