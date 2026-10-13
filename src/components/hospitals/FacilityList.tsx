"use client";

import { useTranslations } from "next-intl";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import type { FacilityView, Tier } from "@/lib/schemas";

const ORDER: Tier[] = ["confirmed", "reported", "unknown"];

/** Facilities grouped Confirmed, Reported, Unknown, each with its last-verified time. */
export function FacilityList({ facilities, windowLabel }: { facilities: FacilityView[]; windowLabel?: string }) {
  const t = useTranslations("facilities");
  const cap = useTranslations("capabilities");
  const conf = useTranslations("confidence");
  return (
    <div className="space-y-4">
      {ORDER.map((tier) => {
        const items = facilities.filter((f) => f.tier === tier);
        if (!items.length) return null;
        return (
          <section key={tier} aria-labelledby={`fac-${tier}`}>
            <h3 id={`fac-${tier}`} className="mb-2">
              {conf(`${tier}.group`)} <span className="font-normal text-muted">({items.length})</span>
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((f) => (
                <li key={f.capability} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface p-3">
                  <span className="font-medium">{cap(f.capability)}</span>
                  <ConfidenceBadge tier={f.tier} updatedAt={f.verifiedAt} size="sm" windowLabel={windowLabel} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {facilities.length === 0 ? <p className="text-muted">{t("none")}</p> : null}
    </div>
  );
}
