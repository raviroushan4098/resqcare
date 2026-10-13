"use client";

import { Table2, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ChartSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Every chart has a "View as table" alternative and a caption defining the metric. */
export function ChartCard<T extends Record<string, unknown>>({
  title,
  caption,
  chart,
  rows,
  columns,
  loading,
}: {
  title: string;
  caption: string;
  chart: ReactNode;
  rows: T[];
  columns: { key: keyof T & string; header: string; format?: (v: T[keyof T]) => ReactNode }[];
  loading?: boolean;
}) {
  const t = useTranslations("admin.chart");
  const [asTable, setAsTable] = useState(false);
  const id = title.replace(/\W+/g, "-").toLowerCase();
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg">{title}</h2>
        <Button variant="ghost" size="sm" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? <BarChart3 aria-hidden="true" className="h-4 w-4" /> : <Table2 aria-hidden="true" className="h-4 w-4" />}
          {asTable ? t("viewChart") : t("viewTable")}
        </Button>
      </div>
      {loading ? (
        <ChartSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : asTable ? (
        <div className="max-h-80 overflow-auto" role="region" aria-labelledby={id} tabIndex={0}>
          <table className="w-full text-left text-sm" aria-labelledby={id}>
            <thead className="sticky top-0 bg-surface">
              <tr>{columns.map((c) => <th key={c.key} scope="col" className="p-2">{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {columns.map((c) => <td key={c.key} className="p-2">{c.format ? c.format(r[c.key]) : String(r[c.key] ?? "—")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-labelledby={id} aria-describedby={`${id}-cap`} className="h-64 w-full">
          {chart}
        </div>
      )}
      <p id={`${id}-cap`} className="text-sm text-muted">{caption}</p>
    </Card>
  );
}
