"use client";

import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryPicker } from "@/components/emergency/CategoryPicker";
import { LocationGate, type PickedLocation } from "@/components/emergency/LocationGate";
import { NoConfidentMatch } from "@/components/emergency/NoConfidentMatch";
import { RadiusSelect } from "@/components/emergency/RadiusSelect";
import { ResultCard } from "@/components/emergency/ResultCard";
import { ResultsToolbar } from "@/components/emergency/ResultsToolbar";
import { SymptomTextField } from "@/components/emergency/SymptomTextField";
import { CompareTable } from "@/components/hospitals/CompareTable";
import { LazyMap } from "@/components/maps/LazyMap";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageShell } from "@/components/shared/PageShell";
import { LoadingRegion, ResultCardSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { api, isApiError } from "@/lib/api";
import { LIMITS } from "@/lib/constants";
import { CategorySchema, SearchResponseSchema, type Category, type HospitalSummary, type SearchResponse, type SearchResult } from "@/lib/schemas";
import { ShareDialog } from "./ShareDialog";

const CACHE_KEY = "rq-last-search";

function readCache(): { at: string; data: SearchResponse; degraded: string[] } | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function EmergencySearch() {
  const t = useTranslations("emergency");
  const r = useTranslations("results");
  usePageTitle(t("title"));
  const params = useSearchParams();
  const cfg = usePublicConfig();
  const initialCat = CategorySchema.safeParse(params.get("category"));
  const [category, setCategory] = useState<Category | null>(initialCat.success ? initialCat.data : null);
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [text, setText] = useState("");
  const [radius, setRadius] = useState<number>(10);
  const [catError, setCatError] = useState<string | undefined>();
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<"rank" | "distance">("rank");
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<SearchResult | null>(null);
  const [cached, setCached] = useState<ReturnType<typeof readCache>>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (cfg.data) setRadius(cfg.data.defaultRadiusKm);
  }, [cfg.data]);
  useEffect(() => setCached(readCache()), []);

  const search = useMutation({
    mutationFn: async (loc: PickedLocation) => {
      const res = await api.post<SearchResponse>(
        "/emergency/search",
        { category, text: text.trim() || undefined, lat: loc.lat, lng: loc.lng, locationSource: loc.source, radiusKm: radius, locale: document.documentElement.lang === "hi" ? "hi" : "en" },
        { schema: SearchResponseSchema },
      );
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), data: res.data, degraded: res.meta.degraded ?? [] }));
      } catch {
        /* cache is optional */
      }
      return res;
    },
    onSuccess: () => {
      setCompare([]);
      requestAnimationFrame(() => resultsRef.current?.focus());
    },
  });

  // With no location yet, use the demo city centre so search is never blocked.
  const fallback = cfg.data ? { lat: cfg.data.demoCity.lat, lng: cfg.data.demoCity.lng, name: cfg.data.demoCity.name } : undefined;

  function submit() {
    if (!category) {
      setCatError(t("chooseCategory"));
      return;
    }
    setCatError(undefined);
    // No location given: search around the city centre rather than block.
    const loc: PickedLocation = location ?? { lat: fallback?.lat ?? 28.4744, lng: fallback?.lng ?? 77.504, source: "manual", label: fallback?.name };
    if (!location) setLocation(loc);
    search.mutate(loc);
  }

  const offlineCache = search.isError && isApiError(search.error) && search.error.code === "NETWORK_ERROR" ? cached : null;
  const data = search.data?.data ?? offlineCache?.data ?? null;
  const degraded = search.data?.meta.degraded ?? offlineCache?.degraded ?? [];
  const results = useMemo(() => {
    const rs = data?.results ?? [];
    return sort === "distance" ? [...rs].sort((a, b) => a.distanceKm - b.distanceKm) : rs;
  }, [data, sort]);
  const compareItems: HospitalSummary[] = results
    .filter((x) => compare.includes(x.hospitalId))
    .map((x) => ({
      id: x.hospitalId, name: x.name, verification: x.verification, verifiedAt: null, address: "", city: "", lat: x.lat, lng: x.lng, phone: x.phone,
      emergency24x7: x.facilities.some((f) => f.capability === "emergency_24x7"), specialties: [], facilities: x.facilities,
      availability: { ...x.availability, icuTotal: null, emergencyTotal: null, ventilatorsTotal: null, servicesNow: null, source: null }, distanceKm: x.distanceKm, isFictional: true,
    }));
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= LIMITS.compareMax ? c : [...c, id]));

  return (
    <PageShell audience="patient" width="wide">
      <p className="mb-4 rounded-control border-2 border-emergency bg-tint-emergency p-3 font-semibold text-emergency">
        {t("lifeThreatening")} <a href="tel:112" className="underline">{t("call112Now")}</a>
      </p>
      <h1 className="mb-4">{t("title")}</h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px),1fr]">
        <form
          className="space-y-6"
          aria-label={t("formLabel")}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <section aria-labelledby="loc-label" className="space-y-2">
            <h2 id="loc-label" className="text-lg">{t("step1")}</h2>
            <LocationGate value={location} onChange={setLocation} fallbackCenter={fallback} />
          </section>
          <section aria-labelledby="category-label" className="space-y-2">
            <h2 id="category-label" className="text-lg">{t("step2")}</h2>
            <CategoryPicker value={category} onChange={(c) => (setCategory(c), setCatError(undefined))} error={catError} />
          </section>
          <section className="space-y-2">
            <h2 className="text-lg">{t("step3")}</h2>
            <SymptomTextField value={text} onChange={setText} />
          </section>
          <RadiusSelect value={radius} options={cfg.data?.radiusOptionsKm ?? [5, 10, 15, 25]} max={cfg.data?.maxRadiusKm ?? 25} onChange={setRadius} />
          <Button type="submit" size="lg" block loading={search.isPending}>
            <Search aria-hidden="true" className="h-5 w-5" />
            {t("submit")}
          </Button>
          {!location ? <p className="text-sm text-muted">{t("noLocationNote")}</p> : null}
        </form>

        <section aria-labelledby="results-title" className="space-y-4">
          <h2 id="results-title" ref={resultsRef} tabIndex={-1} className="sr-only">{r("title")}</h2>
          {degraded.includes("ai") ? <StatusBanner variant="degraded-ai" title={r("degradedAi")} /> : null}
          {degraded.includes("maps") ? <StatusBanner variant="degraded-maps" title={r("degradedMaps")} /> : null}
          {offlineCache ? <StatusBanner variant="offline" title={r("cachedTitle")} description={r("cachedBody")} /> : null}
          {search.isPending ? (
            <LoadingRegion label={r("searching")}>
              <div className="space-y-3">
                <ResultCardSkeleton />
                <ResultCardSkeleton />
              </div>
            </LoadingRegion>
          ) : search.isError && !offlineCache ? (
            <ErrorState error={search.error} onRetry={() => search.variables && search.mutate(search.variables)} />
          ) : data ? (
            data.noConfidentMatch ? (
              <NoConfidentMatch nearest={data.nearest} />
            ) : (
              <>
                <ResultsToolbar count={results.length} view={view} onView={setView} sort={sort} onSort={setSort} compareCount={compare.length} onCompare={() => setCompareOpen(true)} />
                {view === "map" ? (
                  <LazyMap
                    center={location ?? fallback ?? { lat: 28.47, lng: 77.5 }}
                    markers={results.map((x) => ({ id: x.hospitalId, lat: x.lat, lng: x.lng, title: `${x.rank}. ${x.name}`, kind: "verified" as const }))}
                    label={r("mapLabel")}
                    degraded={degraded.includes("maps")}
                  />
                ) : null}
                <ol className="space-y-3" aria-label={r("listLabel")}>
                  {results.map((x) => (
                    <li key={x.hospitalId}>
                      <ResultCard
                        result={x}
                        userHasLocation={!!location}
                        onCompareToggle={toggleCompare}
                        compareSelected={compare.includes(x.hospitalId)}
                        compareDisabled={compare.length >= LIMITS.compareMax}
                        onShare={setShareTarget}
                      />
                    </li>
                  ))}
                </ol>
              </>
            )
          ) : (
            <p className="rounded-card border border-dashed border-border-strong p-6 text-center text-muted">{r("prompt")}</p>
          )}
        </section>
      </div>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent title={r("compareTitle")} side="right">
          <CompareTable items={compareItems} />
        </DialogContent>
      </Dialog>
      {shareTarget && category && location ? (
        <ShareDialog target={shareTarget} category={category} location={location} onClose={() => setShareTarget(null)} />
      ) : null}
    </PageShell>
  );
}
