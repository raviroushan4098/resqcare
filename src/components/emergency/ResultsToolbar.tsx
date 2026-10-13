"use client";

import { List, Map as MapIcon, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function ResultsToolbar({
  count,
  view,
  onView,
  sort,
  onSort,
  compareCount,
  onCompare,
}: {
  count: number;
  view: "list" | "map";
  onView: (v: "list" | "map") => void;
  sort: "rank" | "distance";
  onSort: (s: "rank" | "distance") => void;
  compareCount: number;
  onCompare: () => void;
}) {
  const t = useTranslations("results");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="font-semibold">{t("count", { count })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("viewLabel")} className="flex rounded-control border border-border-strong p-0.5">
          {(["list", "map"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onView(v)}
              className={cn("flex min-h-touch items-center gap-1 rounded-[10px] px-3", view === v ? "bg-text text-white" : "")}
            >
              {v === "list" ? <List aria-hidden="true" className="h-4 w-4" /> : <MapIcon aria-hidden="true" className="h-4 w-4" />}
              {t(v)}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="sort">{t("sortLabel")}</label>
        <Select id="sort" value={sort} onChange={(e) => onSort(e.target.value as "rank" | "distance")} className="w-auto">
          <option value="rank">{t("sortRank")}</option>
          <option value="distance">{t("sortDistance")}</option>
        </Select>
        <Button variant="secondary" disabled={compareCount < 2} onClick={onCompare}>
          <Scale aria-hidden="true" className="h-4 w-4" />
          {t("compareN", { count: compareCount })}
        </Button>
      </div>
    </div>
  );
}
