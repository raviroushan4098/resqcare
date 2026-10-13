"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, CircleDashed, XCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuditTable } from "@/components/admin/AuditTable";
import { ConfigForm } from "@/components/admin/ConfigForm";
import { KpiTile } from "@/components/admin/KpiTile";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { Card } from "@/components/ui/card";
import { useApiQuery } from "@/hooks/useApiQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import type { AdminConfig, AuditEntry, KpiSet } from "@/lib/schemas";

type Health = { status: string; configured: boolean; detail?: string | null; lastCheckedAt?: string | null };
type Overview = {
  kpis: KpiSet;
  queues: { pendingHospitals: number; flaggedAvailability: number; reportedReviews: number; pendingReviews: number; providerApplications: number };
  health: { maps: Health; ai: Health; notifications: Health; database: Health & { backend: string }; demoMode: boolean; authMode: string };
  recentAudit: AuditEntry[];
};

const HEALTH_ICON = { ok: CheckCircle2, degraded: AlertTriangle, fallback: CircleDashed, unknown: CircleDashed, down: XCircle } as const;

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");
  usePageTitle(t("title"));
  const qc = useQueryClient();
  const ov = useApiQuery<Overview>(["admin-overview"], "/admin/overview", { refetchInterval: 30_000 });
  const cfg = useApiQuery<AdminConfig>(["admin-config"], "/admin/config");
  const k = ov.data?.kpis;
  const kpis: { key: keyof KpiSet; unit?: string }[] = [
    { key: "searchLatencyP95Ms", unit: "ms" },
    { key: "dataFreshnessPct", unit: "%" },
    { key: "bookingAcceptanceRate", unit: "%" },
    { key: "failedRequests" },
    { key: "dispatchCompletionRate", unit: "%" },
  ];
  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} description={t("window")} />
      <section aria-labelledby="kpis">
        <h2 id="kpis" className="sr-only">{t("kpis")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map(({ key, unit }) => <KpiTile key={key} label={t(`kpi.${key}`)} definition={t(`kpiDef.${key}`)} value={k ? (k[key] as number | null) : null} unit={unit} loading={ov.isPending} error={ov.isError} />)}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg">{t("queues")}</h2>
          {ov.isPending ? <TableSkeleton rows={4} /> : ov.isError ? <ErrorState error={ov.error} onRetry={() => void ov.refetch()} /> : (
            <ul className="divide-y divide-border">
              {([
                ["pendingHospitals", "/admin/hospitals?status=pending"],
                ["flaggedAvailability", "/admin/hospitals?tab=flags"],
                ["reportedReviews", "/admin/hospitals?tab=reviews"],
                ["pendingReviews", "/admin/hospitals?tab=reviews"],
                ["providerApplications", "/admin/providers"],
              ] as const).map(([q, href]) => (
                <li key={q}><Link href={href} className="flex min-h-touch items-center justify-between px-1 hover:bg-bg"><span>{t(`queue.${q}`)}</span><span className="text-xl font-bold">{ov.data.queues[q]}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-lg">{t("health")}</h2>
          {ov.isPending ? <TableSkeleton rows={4} /> : ov.isError ? <ErrorState error={ov.error} /> : (
            <ul className="space-y-2">
              {(["maps", "ai", "notifications", "database"] as const).map((n) => {
                const h = ov.data.health[n];
                const Icon = HEALTH_ICON[(h.status as keyof typeof HEALTH_ICON) ?? "unknown"] ?? CircleDashed;
                return (
                  <li key={n} className="flex items-start gap-2">
                    <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 ${h.status === "ok" ? "text-confirmed" : h.status === "down" ? "text-emergency" : "text-reported-text"}`} />
                    <div>
                      <p className="font-medium">{t(`integration.${n}`)}: {t(`healthStatus.${h.status as "ok"}`)}</p>
                      {h.detail ? <p className="text-sm text-muted">{h.detail}</p> : null}
                    </div>
                  </li>
                );
              })}
              <li className="font-medium">{t("demoStatus", { state: ov.data.health.demoMode ? t("on") : t("off") })}</li>
              <li className="text-sm text-muted">{t("backend", { db: ov.data.health.database.backend, auth: ov.data.health.authMode })}</li>
            </ul>
          )}
        </Card>
      </div>
      {cfg.isPending ? <TableSkeleton rows={6} /> : cfg.isError ? <ErrorState error={cfg.error} /> : (
        <ConfigForm
          initial={cfg.data}
          onSave={async (c) => {
            await api.put("/admin/config", c);
            void qc.invalidateQueries({ queryKey: ["admin-config"] });
            void qc.invalidateQueries({ queryKey: ["config", "public"] });
            void qc.invalidateQueries({ queryKey: ["admin-overview"] });
          }}
        />
      )}
      <section>
        <h2 className="mb-2 text-lg">{t("audit")}</h2>
        {ov.data ? <AuditTable items={ov.data.recentAudit} /> : null}
      </section>
    </div>
  );
}
