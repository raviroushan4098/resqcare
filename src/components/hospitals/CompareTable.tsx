"use client";

import { useTranslations } from "next-intl";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import { useAppLocale } from "@/hooks/useAppLocale";
import { formatDistanceKm } from "@/lib/format";
import type { Capability, HospitalSummary } from "@/lib/schemas";

const ROWS: Capability[] = ["emergency_24x7", "icu", "ventilator", "ct_scan", "mri", "cath_lab", "stroke_unit", "trauma_center", "blood_bank"];

/**
 * Up to 3 hospitals side by side. Sticky first column with horizontal scroll
 * on desktop; on small screens each hospital becomes its own headed block.
 */
export function CompareTable({ items }: { items: HospitalSummary[] }) {
  const t = useTranslations("compare");
  const cap = useTranslations("capabilities");
  const r = useTranslations("results");
  const locale = useAppLocale();
  const cell = (h: HospitalSummary, c: Capability) => {
    const f = h.facilities.find((x) => x.capability === c);
    return f ? <ConfidenceBadge tier={f.tier} updatedAt={f.verifiedAt} size="sm" /> : <span className="text-muted">{t("notListed")}</span>;
  };
  const avail = (h: HospitalSummary) =>
    h.verification !== "approved" || h.availability.tier === "unknown" ? (
      <span className="text-muted">{t("unknown")}</span>
    ) : (
      <div className="space-y-1">
        <p>{r("availabilitySummary", { icu: h.availability.icuBeds ?? "?", er: h.availability.emergencyBeds ?? "?", vent: h.availability.ventilators ?? "?" })}</p>
        <ConfidenceBadge tier={h.availability.tier} updatedAt={h.availability.updatedAt} size="sm" />
      </div>
    );

  return (
    <>
      <div className="hidden overflow-x-auto md:block" role="region" aria-label={t("caption")} tabIndex={0}>
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface p-2">{t("feature")}</th>
              {items.map((h) => (
                <th key={h.id} scope="col" className="min-w-[200px] p-2 align-top">
                  <p className="font-semibold">{h.name}</p>
                  <VerifiedBadge state={h.verification} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <th scope="row" className="sticky left-0 bg-surface p-2">{t("distance")}</th>
              {items.map((h) => <td key={h.id} className="p-2">{h.distanceKm !== null ? r("distanceOnly", { distance: formatDistanceKm(h.distanceKm, locale) }) : t("unknown")}</td>)}
            </tr>
            <tr className="border-t border-border">
              <th scope="row" className="sticky left-0 bg-surface p-2">{t("availability")}</th>
              {items.map((h) => <td key={h.id} className="p-2">{avail(h)}</td>)}
            </tr>
            {ROWS.map((c) => (
              <tr key={c} className="border-t border-border">
                <th scope="row" className="sticky left-0 bg-surface p-2">{cap(c)}</th>
                {items.map((h) => <td key={h.id} className="p-2">{cell(h, c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-4 md:hidden">
        {items.map((h) => (
          <section key={h.id} aria-labelledby={`cmp-${h.id}`} className="rounded-card border border-border p-3">
            <h3 id={`cmp-${h.id}`}>{h.name}</h3>
            <VerifiedBadge state={h.verification} />
            <dl className="mt-2 space-y-2 text-sm">
              <div><dt className="font-semibold">{t("distance")}</dt><dd>{h.distanceKm !== null ? r("distanceOnly", { distance: formatDistanceKm(h.distanceKm, locale) }) : t("unknown")}</dd></div>
              <div><dt className="font-semibold">{t("availability")}</dt><dd>{avail(h)}</dd></div>
              {ROWS.map((c) => (
                <div key={c} className="flex flex-wrap items-center justify-between gap-2">
                  <dt>{cap(c)}</dt>
                  <dd>{cell(h, c)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
