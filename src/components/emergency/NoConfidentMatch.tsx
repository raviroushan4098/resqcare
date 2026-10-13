"use client";

import { Phone, SearchX } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAppLocale } from "@/hooks/useAppLocale";
import { formatDistanceKm } from "@/lib/format";
import type { NearestHospital } from "@/lib/schemas";
import { InlineEmergencyNumbers } from "./InlineEmergencyNumbers";

export function NoConfidentMatch({ nearest }: { nearest: NearestHospital[] }) {
  const t = useTranslations("results");
  const locale = useAppLocale();
  return (
    <section aria-labelledby="ncm-title" className="space-y-4 rounded-card border-2 border-reported bg-tint-reported p-4">
      <div className="flex items-start gap-3">
        <SearchX aria-hidden="true" className="h-8 w-8 shrink-0 text-reported-text" />
        <div>
          <h2 id="ncm-title">{t("noMatchTitle")}</h2>
          <p className="mt-1">{t("noMatchBody")}</p>
        </div>
      </div>
      <InlineEmergencyNumbers />
      {nearest.length ? (
        <div>
          <h3 className="mb-2">{t("nearestToCall")}</h3>
          <ul className="space-y-2">
            {nearest.map((h) => (
              <li key={h.hospitalId} className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface p-3">
                <div>
                  <p className="font-semibold">{h.name}</p>
                  <p className="text-sm text-muted">{t("distanceOnly", { distance: formatDistanceKm(h.distanceKm, locale) })}</p>
                </div>
                <Button asChild variant="positive">
                  <a href={`tel:${h.phone.replace(/\s/g, "")}`} aria-label={t("callLabel", { name: h.name, phone: h.phone })}>
                    <Phone aria-hidden="true" className="h-5 w-5" />
                    {t("call")}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button asChild variant="secondary">
        <Link href="/hospitals">{t("browseAll")}</Link>
      </Button>
    </section>
  );
}
