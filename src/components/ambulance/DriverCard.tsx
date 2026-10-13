"use client";

import { Ambulance, Eye, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BookingView } from "@/lib/schemas";

/** Shown only from Accepted. The phone number stays masked unless the API marks it revealable. */
export function DriverCard({ booking }: { booking: BookingView }) {
  const t = useTranslations("booking.driver");
  const ty = useTranslations("ambulanceTypes");
  const [revealed, setRevealed] = useState(false);
  if (!booking.provider) return null;
  const d = booking.driver;
  return (
    <Card className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg">
        <Ambulance aria-hidden="true" className="h-5 w-5" />
        {t("title")}
      </h2>
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">{t("provider")}</dt>
        <dd className="font-medium">{booking.provider.name}</dd>
        {booking.vehicle ? (
          <>
            <dt className="text-muted">{t("vehicle")}</dt>
            <dd className="font-medium">{booking.vehicle.registration} · {ty(booking.vehicle.type)}</dd>
          </>
        ) : null}
        {d ? (
          <>
            <dt className="text-muted">{t("driver")}</dt>
            <dd className="font-medium">{d.firstName}</dd>
            <dt className="text-muted">{t("phone")}</dt>
            <dd className="font-medium">{revealed && d.phone ? d.phone : d.phoneMasked}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted">{t("driver")}</dt>
            <dd>{t("notAssigned")}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {booking.canRevealPhone && d?.phone ? (
          revealed ? (
            <Button asChild variant="positive">
              <a href={`tel:${d.phone}`}>
                <Phone aria-hidden="true" className="h-4 w-4" />
                {t("callDriver")}
              </a>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setRevealed(true)}>
              <Eye aria-hidden="true" className="h-4 w-4" />
              {t("reveal")}
            </Button>
          )
        ) : null}
      </div>
    </Card>
  );
}
