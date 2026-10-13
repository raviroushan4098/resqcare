"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CompareTable } from "@/components/hospitals/CompareTable";
import { HospitalCard } from "@/components/hospitals/HospitalCard";
import { EMPTY_FILTERS, HospitalFilters, type HospitalFilterValues } from "@/components/hospitals/HospitalFilters";
import { LazyMap } from "@/components/maps/LazyMap";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageShell } from "@/components/shared/PageShell";
import { LoadingRegion, ResultCardSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/useDebounce";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { api } from "@/lib/api";
import { LIMITS } from "@/lib/constants";
import { HospitalListResponseSchema, type HospitalSummary } from "@/lib/schemas";

export default function HospitalsPage() {
  const t = useTranslations("hospitals");
  const r = useTranslations("results");
  usePageTitle(t("title"));
  const cfg = usePublicConfig();
  const [filters, setFilters] = useState<HospitalFilterValues>(EMPTY_FILTERS);
  const f = useDebounce(filters, 300);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const list = useInfiniteQuery({
    queryKey: ["hospitals", f],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const res = await api.get("/hospitals", {
        anonymous: true,
        schema: HospitalListResponseSchema,
        query: { q: f.q, specialty: f.specialty, emergency24x7: f.emergency24x7 || undefined, verified: f.verifiedOnly || undefined, confidence: f.confidence || undefined, cursor: pageParam || undefined, limit: 20 },
      });
      return { ...res.data, next: res.meta.nextCursor ?? null };
    },
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const items: HospitalSummary[] = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  const compared = useQuery({
    queryKey: ["compare", compare],
    enabled: open && compare.length > 0,
    queryFn: async () => (await api.post<{ items: HospitalSummary[] }>("/hospitals/compare", { ids: compare }, { anonymous: true })).data.items,
  });
  const toggle = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= LIMITS.compareMax ? c : [...c, id]));

  return (
    <PageShell width="wide">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6 lg:grid-cols-[300px,1fr]">
        <aside>
          <HospitalFilters value={filters} onChange={setFilters} />
        </aside>
        <section aria-labelledby="hosp-results" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="hosp-results" aria-live="polite" className="text-lg">{t("count", { count: total })}</h2>
            <div className="flex gap-2">
              <div role="group" aria-label={r("viewLabel")} className="flex rounded-control border border-border-strong p-0.5">
                {(["list", "map"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-touch rounded-[10px] px-3 ${view === v ? "bg-text text-white" : ""}`}>
                    {r(v)}
                  </button>
                ))}
              </div>
              <Button variant="secondary" disabled={compare.length < 2} onClick={() => setOpen(true)}>
                <Scale aria-hidden="true" className="h-4 w-4" />
                {r("compareN", { count: compare.length })}
              </Button>
            </div>
          </div>
          {compare.length >= LIMITS.compareMax ? <p className="text-sm text-muted">{t("compareLimit")}</p> : null}
          {view === "map" && cfg.data ? (
            <LazyMap
              center={cfg.data.demoCity}
              zoom={11}
              cluster
              selectedId={selected}
              onSelect={setSelected}
              markers={items.map((h) => ({ id: h.id, lat: h.lat, lng: h.lng, title: h.name, kind: h.verification === "approved" ? "verified" : "unverified" }))}
              label={t("mapLabel")}
            />
          ) : null}
          {list.isPending ? (
            <LoadingRegion label={t("loading")}>
              <div className="space-y-3"><ResultCardSkeleton /><ResultCardSkeleton /></div>
            </LoadingRegion>
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t("empty")} description={t("emptyBody")} primaryAction={<Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>{t("filters.reset")}</Button>} />
          ) : (
            <>
              <ul className="space-y-3">
                {items.map((h) => (
                  <li key={h.id}>
                    <HospitalCard h={h} selected={selected === h.id} onCompareToggle={toggle} compareSelected={compare.includes(h.id)} compareDisabled={compare.length >= LIMITS.compareMax} />
                  </li>
                ))}
              </ul>
              {list.hasNextPage ? (
                <Button variant="outline" block loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t("loadMore")}</Button>
              ) : null}
            </>
          )}
        </section>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={r("compareTitle")} side="right">
          {compared.isPending ? <ResultCardSkeleton /> : compared.isError ? <ErrorState error={compared.error} /> : <CompareTable items={compared.data ?? []} />}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
