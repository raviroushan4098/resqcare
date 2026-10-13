"use client";

import { ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppLocale } from "@/hooks/useAppLocale";
import { formatDistanceKm } from "@/lib/format";
import type { HospitalSummary } from "@/lib/schemas";

export function HospitalCard({
  h,
  selected,
  onCompareToggle,
  compareSelected,
  compareDisabled,
}: {
  h: HospitalSummary;
  selected?: boolean;
  onCompareToggle?: (id: string) => void;
  compareSelected?: boolean;
  compareDisabled?: boolean;
}) {
  const t = useTranslations("hospitals");
  const r = useTranslations("results");
  const locale = useAppLocale();
  const verified = h.verification === "approved";
  return (
    <Card className={selected ? "ring-2 ring-primary" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="break-words">{h.name}</h3>
          <p className="text-sm text-muted">{h.address}</p>
          {h.distanceKm !== null ? <p className="text-sm">{r("distanceOnly", { distance: formatDistanceKm(h.distanceKm, locale) })}</p> : null}
        </div>
        <VerifiedBadge state={h.verification} verifiedAt={h.verifiedAt} />
      </div>
      {h.specialties.length ? <p className="mt-2 text-sm">{t("specialties", { list: h.specialties.slice(0, 4).join(", ") })}</p> : null}
      <div className="mt-2">
        {verified ? (
          <ConfidenceBadge tier={h.availability.tier} updatedAt={h.availability.updatedAt} label={t("availabilityLabel")} size="sm" />
        ) : (
          <p className="text-sm font-medium text-muted">{t("noClaims")}</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="positive">
          <a href={`tel:${h.phone.replace(/\s/g, "")}`} aria-label={r("callLabel", { name: h.name, phone: h.phone })}>
            <Phone aria-hidden="true" className="h-4 w-4" />
            {r("call")}
          </a>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/hospitals/${h.id}`}>
            {r("details")}
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
        {onCompareToggle ? (
          <label className="ml-auto flex min-h-touch cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={!!compareSelected} disabled={compareDisabled && !compareSelected} onChange={() => onCompareToggle(h.id)} />
            {r("compare")}
          </label>
        ) : null}
      </div>
    </Card>
  );
}
