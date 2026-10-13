"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/admin/ChartCard";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useApiQuery } from "@/hooks/useApiQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { CATEGORIES } from "@/lib/schemas";

type Series = {
  searchesPerDay: { date: string; searches: number }[];
  latency: { date: string; p50: number | null; p95: number | null }[];
  noMatchRate: { date: string; rate: number | null }[];
  bookingFunnel: { stage: string; count: number }[];
  acceptanceCompletion: { date: string; acceptance: number | null; completion: number | null }[];
  freshnessDistribution: { tier: string; hospitals: number }[];
  failuresByCause: { cause: string; count: number }[];
};
type Resp = { from: string; to: string; series: Series; partial: boolean; totals: { searches: number; bookings: number } };

// Colour-blind safe pairing; every chart also has a table view.
const C1 = "#1F6FEB";
const C2 = "#B26A00";
const iso = (d: Date) => d.toISOString().slice(0, 10);

function toCsv(r: Resp) {
  const lines = ["section,key,value1,value2"];
  r.series.searchesPerDay.forEach((x) => lines.push(`searches,${x.date},${x.searches},`));
  r.series.latency.forEach((x) => lines.push(`latency_ms,${x.date},${x.p50 ?? ""},${x.p95 ?? ""}`));
  r.series.noMatchRate.forEach((x) => lines.push(`no_match_pct,${x.date},${x.rate ?? ""},`));
  r.series.bookingFunnel.forEach((x) => lines.push(`funnel,${x.stage},${x.count},`));
  r.series.acceptanceCompletion.forEach((x) => lines.push(`acceptance_completion_pct,${x.date},${x.acceptance ?? ""},${x.completion ?? ""}`));
  r.series.freshnessDistribution.forEach((x) => lines.push(`freshness,${x.tier},${x.hospitals},`));
  r.series.failuresByCause.forEach((x) => lines.push(`failures,${x.cause},${x.count},`));
  return lines.join("\n");
}

export default function AnalyticsPage() {
  const t = useTranslations("admin.analytics");
  const cat = useTranslations("categories");
  usePageTitle(t("title"));
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 13 * 86_400_000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const q = useApiQuery<Resp>(["admin-analytics", from, to, category, city], "/admin/analytics", { query: { from, to, category: category || undefined, city: city || undefined } });
  const s = q.data?.series;
  const short = (d: unknown) => String(d).slice(5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("disclaimer")}
        actions={
          <Button
            variant="outline"
            disabled={!q.data}
            onClick={() => {
              const blob = new Blob([toCsv(q.data!)], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `resqcare-analytics-${from}-${to}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            {t("export")}
          </Button>
        }
      />
      <form className="grid gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-4" onSubmit={(e) => e.preventDefault()} aria-label={t("filters")}>
        <div><label htmlFor="an-from" className="font-medium">{t("from")}</label><Input id="an-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label htmlFor="an-to" className="font-medium">{t("to")}</label><Input id="an-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label htmlFor="an-cat" className="font-medium">{t("category")}</label>
          <Select id="an-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("all")}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{cat(`${c}.title`)}</option>)}
          </Select>
        </div>
        <div><label htmlFor="an-city" className="font-medium">{t("city")}</label><Input id="an-city" value={city} onChange={(e) => setCity(e.target.value)} /></div>
      </form>
      <StatusBanner variant="info" title={t("disclaimer")} description={t("syntheticNote")} />
      {q.data?.partial ? <StatusBanner variant="stale" title={t("partial")} /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={t("charts.searches")} caption={t("captions.searches")} loading={q.isPending} rows={s?.searchesPerDay ?? []} columns={[{ key: "date", header: t("date") }, { key: "searches", header: t("charts.searches") }]}
            chart={<ResponsiveContainer><BarChart data={s?.searchesPerDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={short} /><YAxis allowDecimals={false} /><Tooltip /><Bar isAnimationActive={false} dataKey="searches" fill={C1} name={t("charts.searches")} /></BarChart></ResponsiveContainer>} />
          <ChartCard title={t("charts.latency")} caption={t("captions.latency")} loading={q.isPending} rows={s?.latency ?? []} columns={[{ key: "date", header: t("date") }, { key: "p50", header: "p50 (ms)" }, { key: "p95", header: "p95 (ms)" }]}
            chart={<ResponsiveContainer><LineChart data={s?.latency}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={short} /><YAxis unit="ms" /><Tooltip /><Legend /><Line isAnimationActive={false} dataKey="p50" stroke={C1} strokeWidth={2} dot={false} /><Line isAnimationActive={false} dataKey="p95" stroke={C2} strokeWidth={2} strokeDasharray="6 3" dot={false} /></LineChart></ResponsiveContainer>} />
          <ChartCard title={t("charts.noMatch")} caption={t("captions.noMatch")} loading={q.isPending} rows={s?.noMatchRate ?? []} columns={[{ key: "date", header: t("date") }, { key: "rate", header: "%" }]}
            chart={<ResponsiveContainer><LineChart data={s?.noMatchRate}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={short} /><YAxis unit="%" /><Tooltip /><Line isAnimationActive={false} dataKey="rate" stroke={C2} strokeWidth={2} name="%" /></LineChart></ResponsiveContainer>} />
          <ChartCard title={t("charts.funnel")} caption={t("captions.funnel")} loading={q.isPending} rows={s?.bookingFunnel ?? []} columns={[{ key: "stage", header: t("stage") }, { key: "count", header: t("count") }]}
            chart={<ResponsiveContainer><BarChart data={s?.bookingFunnel} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="stage" width={90} /><Tooltip /><Bar isAnimationActive={false} dataKey="count" fill={C1} name={t("count")} /></BarChart></ResponsiveContainer>} />
          <ChartCard title={t("charts.acceptance")} caption={t("captions.acceptance")} loading={q.isPending} rows={s?.acceptanceCompletion ?? []} columns={[{ key: "date", header: t("date") }, { key: "acceptance", header: t("acceptance") }, { key: "completion", header: t("completion") }]}
            chart={<ResponsiveContainer><LineChart data={s?.acceptanceCompletion}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={short} /><YAxis unit="%" domain={[0, 100]} /><Tooltip /><Legend /><Line isAnimationActive={false} dataKey="acceptance" name={t("acceptance")} stroke={C1} strokeWidth={2} /><Line isAnimationActive={false} dataKey="completion" name={t("completion")} stroke={C2} strokeWidth={2} strokeDasharray="6 3" /></LineChart></ResponsiveContainer>} />
          <ChartCard title={t("charts.freshness")} caption={t("captions.freshness")} loading={q.isPending} rows={s?.freshnessDistribution ?? []} columns={[{ key: "tier", header: t("tier") }, { key: "hospitals", header: t("hospitals") }]}
            chart={<ResponsiveContainer><BarChart data={s?.freshnessDistribution}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="tier" /><YAxis allowDecimals={false} /><Tooltip /><Bar isAnimationActive={false} dataKey="hospitals" fill={C1} name={t("hospitals")} /></BarChart></ResponsiveContainer>} />
          <ChartCard title={t("charts.failures")} caption={t("captions.failures")} loading={q.isPending} rows={s?.failuresByCause ?? []} columns={[{ key: "cause", header: t("cause") }, { key: "count", header: t("count") }]}
            chart={<ResponsiveContainer><BarChart data={s?.failuresByCause} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="cause" width={140} /><Tooltip /><Bar isAnimationActive={false} dataKey="count" fill={C2} name={t("count")} /></BarChart></ResponsiveContainer>} />
        </div>
      )}
    </div>
  );
}
