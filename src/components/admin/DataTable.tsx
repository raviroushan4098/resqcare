"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
  /** Text used by the filter box. */
  filterValue?: (row: T) => string;
}

/**
 * Sortable, filterable, paginated table with optional row selection and a
 * sticky header. Below md it renders each row as a labelled card.
 */
export function DataTable<T>({
  rows,
  columns,
  rowId,
  caption,
  loading,
  emptyTitle,
  pageSize = 10,
  selectable,
  selected,
  onSelect,
  onRowClick,
  rowLabel,
}: {
  rows: T[];
  columns: Column<T>[];
  rowId: (r: T) => string;
  caption: string;
  loading?: boolean;
  emptyTitle?: string;
  pageSize?: number;
  selectable?: boolean;
  selected?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  onRowClick?: (r: T) => void;
  rowLabel?: (r: T) => string;
}) {
  const t = useTranslations("table");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);

  const processed = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let out = f ? rows.filter((r) => columns.some((c) => (c.filterValue?.(r) ?? "").toLowerCase().includes(f))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) out = [...out].sort((a, b) => {
        const av = col.sortValue!(a) ?? "";
        const bv = col.sortValue!(b) ?? "";
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      });
    }
    return out;
  }, [rows, columns, filter, sort]);

  const pages = Math.max(1, Math.ceil(processed.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = processed.slice(current * pageSize, current * pageSize + pageSize);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect?.(next);
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <label htmlFor={`${caption}-filter`} className="sr-only">{t("filter")}</label>
        <Input id={`${caption}-filter`} placeholder={t("filter")} value={filter} onChange={(e) => (setFilter(e.target.value), setPage(0))} />
      </div>
      {processed.length === 0 ? (
        <EmptyState title={emptyTitle ?? t("empty")} />
      ) : (
        <>
          <div className="hidden max-h-[70vh] overflow-auto rounded-card border border-border md:block" role="region" aria-label={caption} tabIndex={0}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--border)]">
                <tr>
                  {selectable ? <th scope="col" className="w-10 p-2"><span className="sr-only">{t("select")}</span></th> : null}
                  {columns.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className="p-2">
                      {c.sortValue ? (
                        <button type="button" className="inline-flex min-h-touch items-center gap-1 font-semibold" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? ((s.dir * -1) as 1 | -1) : 1 }))}>
                          {c.header}
                          {sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp aria-hidden="true" className="h-4 w-4" /> : <ArrowDown aria-hidden="true" className="h-4 w-4" />) : null}
                        </button>
                      ) : (
                        <span className="font-semibold">{c.header}</span>
                      )}
                    </th>
                  ))}
                  {onRowClick ? <th scope="col" className="p-2"><span className="sr-only">{t("actions")}</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={rowId(r)} className="border-t border-border hover:bg-bg">
                    {selectable ? (
                      <td className="p-2"><input type="checkbox" aria-label={t("selectRow", { row: rowLabel?.(r) ?? rowId(r) })} className="h-5 w-5" checked={selected?.has(rowId(r)) ?? false} onChange={() => toggle(rowId(r))} /></td>
                    ) : null}
                    {columns.map((c) => <td key={c.key} className="p-2 align-top">{c.cell(r)}</td>)}
                    {onRowClick ? <td className="p-2"><Button size="sm" variant="outline" onClick={() => onRowClick(r)}>{t("open")}<span className="sr-only">: {rowLabel?.(r)}</span></Button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {visible.map((r) => (
              <li key={rowId(r)} className="rounded-card border border-border bg-surface p-3">
                <dl className="space-y-1 text-sm">
                  {columns.map((c) => (
                    <div key={c.key} className="flex flex-wrap justify-between gap-2">
                      <dt className="font-semibold">{c.header}</dt>
                      <dd>{c.cell(r)}</dd>
                    </div>
                  ))}
                </dl>
                {onRowClick ? <Button size="sm" variant="outline" className="mt-2" onClick={() => onRowClick(r)}>{t("open")}</Button> : null}
              </li>
            ))}
          </ul>
          <nav aria-label={t("pagination")} className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted">{t("pageOf", { page: current + 1, pages, total: processed.length })}</p>
            <div className="flex gap-2">
              <Button size="icon" variant="outline" aria-label={t("prev")} disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft aria-hidden="true" className="h-5 w-5" /></Button>
              <Button size="icon" variant="outline" aria-label={t("next")} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight aria-hidden="true" className="h-5 w-5" /></Button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
