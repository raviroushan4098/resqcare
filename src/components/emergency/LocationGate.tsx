"use client";

import { Crosshair, LocateFixed, MapPin, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useLocation } from "@/hooks/useLocation";
import { PLACES } from "@/lib/places";

export type PickedLocation = { lat: number; lng: number; source: "gps" | "manual"; label?: string };
type GateState = "idle" | "explaining" | "requesting" | "granted" | "denied" | "manual";

/**
 * Explains why location is needed and who sees it before asking. Denial (or
 * no GPS) switches to manual entry automatically. Never blocks the search.
 */
export function LocationGate({
  value,
  onChange,
  initialState = "explaining",
  fallbackCenter,
  purpose = "search",
}: {
  value: PickedLocation | null;
  onChange: (l: PickedLocation | null) => void;
  initialState?: GateState;
  fallbackCenter?: { lat: number; lng: number; name: string };
  /** Changes the explanation: finding hospitals vs. an ambulance pickup. */
  purpose?: "search" | "pickup";
}) {
  const t = useTranslations("location");
  const locale = useAppLocale();
  const geo = useLocation();
  const [state, setState] = useState<GateState>(value ? (value.source === "gps" ? "granted" : "manual") : initialState);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (geo.state.status === "granted") {
      setState("granted");
      onChange({ lat: geo.state.lat, lng: geo.state.lng, source: "gps" });
    } else if (geo.state.status === "denied") {
      setState("denied");
    } else if (geo.state.status === "requesting") setState("requesting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.state]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return PLACES.filter((p) => !s || p.name.toLowerCase().includes(s) || p.nameHi.includes(q.trim())).slice(0, 6);
  }, [q]);

  const pickPlace = (p: (typeof PLACES)[number]) => {
    onChange({ lat: p.lat, lng: p.lng, source: "manual", label: locale === "hi" ? p.nameHi : p.name });
    setState("manual");
  };

  if (value && (state === "granted" || state === "manual")) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-confirmed bg-tint-confirmed p-3">
        <p className="flex items-center gap-2 font-medium">
          <MapPin aria-hidden="true" className="h-5 w-5 text-confirmed" />
          {value.source === "gps" ? t("usingGps") : t("usingPlace", { place: value.label ?? t("pinnedPoint") })}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            geo.reset();
            setState("manual");
          }}
        >
          {t("change")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4">
      {state !== "manual" && state !== "denied" ? (
        <>
          <p>{t(purpose === "pickup" ? "whyPickup" : "why")}</p>
          <p className="text-sm text-muted">{t("who")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" onClick={() => geo.request()} loading={state === "requesting"}>
              <LocateFixed aria-hidden="true" className="h-5 w-5" />
              {state === "requesting" ? t("requesting") : t("useMyLocation")}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setState("manual")}>
              <Search aria-hidden="true" className="h-5 w-5" />
              {t("enterManually")}
            </Button>
          </div>
        </>
      ) : null}

      {state === "denied" ? (
        <StatusBanner variant="info" title={t("deniedTitle")} description={t("deniedBody")} />
      ) : null}

      {state === "manual" || state === "denied" ? (
        <div className="space-y-2">
          <label htmlFor="place-search" className="font-medium">{t("searchLabel")}</label>
          <Input id="place-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} autoComplete="off" />
          <ul className="space-y-1" aria-label={t("suggestions")}>
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pickPlace(p)} className="flex min-h-touch w-full items-center gap-2 rounded-control px-2 text-left hover:bg-bg">
                  <MapPin aria-hidden="true" className="h-4 w-4 text-muted" />
                  {locale === "hi" ? p.nameHi : p.name}
                </button>
              </li>
            ))}
          </ul>
          {fallbackCenter ? (
            <Button variant="ghost" size="sm" onClick={() => onChange({ lat: fallbackCenter.lat, lng: fallbackCenter.lng, source: "manual", label: fallbackCenter.name })}>
              <Crosshair aria-hidden="true" className="h-4 w-4" />
              {t("useCityCentre", { city: fallbackCenter.name })}
            </Button>
          ) : null}
          {state === "manual" ? (
            <Button variant="ghost" size="sm" onClick={() => geo.request()}>
              <LocateFixed aria-hidden="true" className="h-4 w-4" />
              {t("tryGpsAgain")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
