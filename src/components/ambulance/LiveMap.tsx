"use client";

import { Navigation, MapPinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { LazyMap } from "@/components/maps/LazyMap";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { useAppLocale } from "@/hooks/useAppLocale";
import { LIMITS } from "@/lib/constants";
import { formatMinutes } from "@/lib/format";
import type { BookingStatus } from "@/lib/schemas";

const LIVE: BookingStatus[] = ["Assigned", "EnRoute"];

export function isLocationFresh(at: string | null | undefined, now: number) {
  return !!at && now - new Date(at).getTime() <= LIMITS.driverLocationStaleMs;
}

/**
 * Ambulance marker and route only while Assigned/En Route AND the last fix is
 * under 30 s old. Otherwise "Location not available" and no ETA.
 */
export function LiveMap({
  status,
  location,
  pickup,
  etaMinutes,
  now: nowProp,
}: {
  status: BookingStatus;
  location: { lat: number; lng: number; at: string } | null;
  pickup: { lat: number; lng: number };
  etaMinutes: number | null;
  now?: number;
}) {
  const t = useTranslations("booking.live");
  const locale = useAppLocale();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 5000);
    return () => clearInterval(i);
  }, []);
  const now = nowProp ?? tick;
  const fresh = LIVE.includes(status) && isLocationFresh(location?.at, now);

  // Throttle marker movement to at most one update per 5 s.
  const [shown, setShown] = useState(location);
  useEffect(() => {
    if (!location) return setShown(null);
    if (!shown || new Date(location.at).getTime() - new Date(shown.at).getTime() >= 5000) setShown(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const markers = useMemo(
    () => [
      { id: "pickup", lat: pickup.lat, lng: pickup.lng, title: t("pickup"), kind: "pickup" as const },
      ...(fresh && shown ? [{ id: "amb", lat: shown.lat, lng: shown.lng, title: t("ambulance"), kind: "ambulance" as const }] : []),
    ],
    [pickup, fresh, shown, t],
  );

  if (!LIVE.includes(status)) return null;

  if (!fresh || !shown) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-card border border-border bg-surface p-4">
        <MapPinOff aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
        <div>
          <p className="font-semibold">{t("unavailable")}</p>
          <p className="text-sm text-muted">{t("unavailableBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="live-title" className="space-y-2">
      <h2 id="live-title" className="text-lg">{t("title")}</h2>
      <p role="status" className="flex items-center gap-2 font-medium">
        <Navigation aria-hidden="true" className="h-5 w-5 text-primary" />
        {etaMinutes !== null ? t("eta", { eta: formatMinutes(etaMinutes, locale) }) : t("etaUnknown")}
        <span className="text-sm font-normal text-muted">
          · {t("updated")} <RelativeTime iso={shown.at} />
        </span>
      </p>
      <LazyMap center={pickup} zoom={13} markers={markers} label={t("mapLabel")} route={[shown, pickup]} />
    </section>
  );
}
