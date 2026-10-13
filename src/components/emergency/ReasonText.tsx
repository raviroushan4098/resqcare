"use client";

import { useTranslations } from "next-intl";
import { useAppLocale } from "@/hooks/useAppLocale";
import { formatDistanceKm } from "@/lib/format";
import type { Reason } from "@/lib/schemas";

/** Renders a structured explanation item from the API in the current language. */
export function useReasonText() {
  const t = useTranslations("reasons");
  const cap = useTranslations("capabilities");
  const tier = useTranslations("confidence");
  const locale = useAppLocale();
  return (r: Reason): string => {
    switch (r.code) {
      case "has_capability":
        return t("has_capability", { capability: cap(r.capability), tier: tier(`${r.tier}.label`) });
      case "beds_available":
        return t(`beds_${r.kind}`, { count: r.count, tier: tier(`${r.tier}.label`) });
      case "closest":
        return t("closest", { distance: formatDistanceKm(r.distanceKm, locale) });
      case "capability_not_recent":
        return t("capability_not_recent", { capability: cap(r.capability) });
      default:
        return t(r.code);
    }
  };
}
