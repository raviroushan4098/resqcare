"use client";

import { AlertCircle, Check, ChevronRight, Navigation, Phone, Send } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppLocale } from "@/hooks/useAppLocale";
import { formatDistanceKm, formatMinutes, formatPhone } from "@/lib/format";
import type { SearchResult } from "@/lib/schemas";
import { useReasonText } from "./ReasonText";

/**
 * One ranked hospital. The Call button is always visible without expanding.
 * Distance and ETA always carry the word "estimate".
 */
export function ResultCard({
  result,
  onCompareToggle,
  compareSelected,
  compareDisabled,
  userHasLocation,
  onShare,
}: {
  result: SearchResult;
  onCompareToggle?: (id: string) => void;
  compareSelected?: boolean;
  compareDisabled?: boolean;
  userHasLocation: boolean;
  onShare?: (r: SearchResult) => void;
}) {
  const t = useTranslations("results");
  const cap = useTranslations("capabilities");
  const locale = useAppLocale();
  const reason = useReasonText();
  const a = result.availability;
  const headingId = `res-${result.hospitalId}`;

  return (
    <Card className="space-y-3" aria-labelledby={headingId}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-text text-lg font-bold text-white">
          {result.rank}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 id={headingId} className="break-words">
            <span className="sr-only">{t("rank", { rank: result.rank })} </span>
            {result.name}
          </h3>
          <VerifiedBadge state={result.verification} />
          {userHasLocation ? (
            <p className="text-sm">
              <Navigation aria-hidden="true" className="mr-1 inline h-4 w-4 text-muted" />
              {t("distanceEta", {
                distance: formatDistanceKm(result.distanceKm, locale),
                eta: result.etaMinutes !== null ? formatMinutes(result.etaMinutes, locale) : t("etaUnknown"),
              })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label={t("facilities")}>
        {result.facilities.map((f) => (
          <ConfidenceBadge key={f.capability} tier={f.tier} updatedAt={f.verifiedAt} label={cap(f.capability)} size="sm" />
        ))}
      </div>

      {result.matchedBecause.length ? (
        <div>
          <p className="text-sm font-semibold">{t("matchedBecause")}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {result.matchedBecause.map((r, i) => (
              <li key={i} className="flex items-start gap-1">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-confirmed" />
                {reason(r)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.unconfirmed.length ? (
        <div>
          <p className="text-sm font-semibold">{t("notVerified")}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {result.unconfirmed.map((r, i) => (
              <li key={i} className="flex items-start gap-1">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-reported-text" />
                {reason(r)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-control bg-bg p-2 text-sm">
        <span className="font-semibold">{t("availability")}: </span>
        {a.tier === "unknown" ? (
          t("availabilityUnknown")
        ) : (
          <>
            {t("availabilitySummary", {
              icu: a.icuBeds === null ? "?" : a.icuBeds,
              er: a.emergencyBeds === null ? "?" : a.emergencyBeds,
              vent: a.ventilators === null ? "?" : a.ventilators,
            })}{" "}
            {a.updatedAt ? (
              <span className="text-muted">
                (<RelativeTime iso={a.updatedAt} />)
              </span>
            ) : null}
          </>
        )}
        <div className="mt-1">
          <ConfidenceBadge tier={a.tier} updatedAt={a.updatedAt} size="sm" />
          {a.tier !== "confirmed" ? <span className="ml-2 font-medium text-reported-text">{t("callToConfirm")}</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="positive" size="lg" className="flex-1">
          <a href={`tel:${result.phone.replace(/\s/g, "")}`} aria-label={t("callLabel", { name: result.name, phone: formatPhone(result.phone) })}>
            <Phone aria-hidden="true" className="h-5 w-5" />
            {t("call")}
          </a>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href={`/hospitals/${result.hospitalId}`}>
            {t("details")}
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onCompareToggle ? (
          <label className="flex min-h-touch cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--primary)]"
              checked={!!compareSelected}
              disabled={compareDisabled && !compareSelected}
              onChange={() => onCompareToggle(result.hospitalId)}
            />
            {t("compare")}
          </label>
        ) : null}
        {onShare ? (
          <Button variant="ghost" size="sm" onClick={() => onShare(result)}>
            <Send aria-hidden="true" className="h-4 w-4" />
            {t("share")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
