"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/useApiQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import type { DemoSettings } from "@/lib/schemas";

type Provider = { id: string; name: string; status: "pending" | "approved" | "rejected" | "suspended"; isDemo: boolean; simulated: boolean; serviceArea: { radiusKm: number }; createdAt: string };
type Application = { id: string; orgName: string; city: string; registryRef: string; status: string; createdAt: string; type: string };
type Perf = { providerId: string; name: string; acceptanceRate: number | null; medianResponseSec: number | null; completionRate: number | null; trips: number };

function DecisionButtons({ id, status, onDone }: { id: string; status: Provider["status"] | "application"; onDone: () => void }) {
  const t = useTranslations("admin.providers");
  const toast = useToast();
  const msg = useApiErrorMessage();
  const [reason, setReason] = useState("");
  const decide = (decision: string) => async () => {
    try {
      await api.post(status === "application" ? `/admin/applications/${id}/decision` : `/admin/providers/${id}/decision`, { decision, reason: reason.trim() || undefined });
      toast({ title: t("done"), tone: "success" });
      onDone();
    } catch (e) {
      toast({ title: msg(e), tone: "error" });
      throw e;
    }
  };
  const reasonField = (
    <Field label={t("reason")} required hint={t("reasonHint")}>
      {({ id: fid, describedBy }) => <Textarea id={fid} aria-describedby={describedBy} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
    </Field>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" || status === "application" ? (
        <ConfirmDialog trigger={<Button size="sm" variant="positive">{t("approve")}</Button>} title={t("approveTitle")} confirmLabel={t("approve")} onConfirm={decide("approve")} />
      ) : null}
      {status === "pending" || status === "application" ? (
        <ConfirmDialog trigger={<Button size="sm" variant="danger">{t("reject")}</Button>} title={t("rejectTitle")} confirmLabel={t("reject")} destructive onConfirm={decide("reject")}>{reasonField}</ConfirmDialog>
      ) : null}
      {status === "approved" ? (
        <ConfirmDialog trigger={<Button size="sm" variant="danger">{t("suspend")}</Button>} title={t("suspendTitle")} description={t("suspendBody")} confirmLabel={t("suspend")} destructive onConfirm={decide("suspend")}>{reasonField}</ConfirmDialog>
      ) : null}
      {status === "suspended" ? (
        <ConfirmDialog trigger={<Button size="sm" variant="secondary">{t("reinstate")}</Button>} title={t("reinstateTitle")} confirmLabel={t("reinstate")} onConfirm={decide("reinstate")} />
      ) : null}
    </div>
  );
}

export default function AdminProvidersPage() {
  const t = useTranslations("admin.providers");
  usePageTitle(t("title"));
  const qc = useQueryClient();
  const toast = useToast();
  const msg = useApiErrorMessage();
  const q = useApiQuery<{ providers: Provider[]; applications: Application[]; hospitalApplications: Application[]; performance: Perf[] }>(["admin-providers"], "/admin/providers");
  const demo = useApiQuery<DemoSettings>(["admin-demo"], "/admin/demo");
  const [draft, setDraft] = useState<DemoSettings | null>(null);
  useEffect(() => {
    if (demo.data) setDraft(demo.data);
  }, [demo.data]);
  const saveDemo = useMutation({
    mutationFn: (d: DemoSettings) => api.put("/admin/demo", d),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ["admin-demo"] }), void qc.invalidateQueries({ queryKey: ["config", "public"] }), toast({ title: t("demoSaved"), tone: "success" })),
    onError: (e) => toast({ title: msg(e), tone: "error" }),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-providers"] });
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} />
      <section className="space-y-3">
        <h2>{t("applications")}</h2>
        {q.isPending ? <TableSkeleton rows={2} /> : [...q.data.applications, ...q.data.hospitalApplications].filter((a) => a.status === "pending").length === 0 ? <EmptyState title={t("noApplications")} /> : (
          <ul className="space-y-2">
            {[...q.data.applications, ...q.data.hospitalApplications].filter((a) => a.status === "pending").map((a) => (
              <li key={a.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{a.orgName} <span className="text-sm font-normal text-muted">· {t(`appType.${a.type as "provider"}`)}</span></p>
                    <p className="text-sm text-muted">{a.city} · {a.registryRef} · <RelativeTime iso={a.createdAt} /></p>
                  </div>
                  <DecisionButtons id={a.id} status="application" onDone={refresh} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h2>{t("providers")}</h2>
        <DataTable
          caption={t("providers")}
          loading={q.isPending}
          rows={q.data?.providers ?? []}
          rowId={(p) => p.id}
          rowLabel={(p) => p.name}
          columns={[
            { key: "name", header: t("name"), cell: (p) => <>{p.name}{p.isDemo ? <span className="ml-1 rounded-full bg-reported px-2 text-xs text-white">{t("demo")}</span> : null}</>, sortValue: (p) => p.name, filterValue: (p) => p.name },
            { key: "status", header: t("status"), cell: (p) => t(`statuses.${p.status}`), sortValue: (p) => p.status, filterValue: (p) => p.status },
            { key: "area", header: t("area"), cell: (p) => `${p.serviceArea.radiusKm} km` },
            { key: "actions", header: t("actions"), cell: (p) => <DecisionButtons id={p.id} status={p.status} onDone={refresh} /> },
          ]}
        />
      </section>
      <section className="space-y-3">
        <h2>{t("performance")}</h2>
        <DataTable
          caption={t("performance")}
          loading={q.isPending}
          rows={q.data?.performance ?? []}
          rowId={(p) => p.providerId}
          columns={[
            { key: "name", header: t("name"), cell: (p) => p.name, sortValue: (p) => p.name },
            { key: "acc", header: t("acceptance"), cell: (p) => pct(p.acceptanceRate), sortValue: (p) => p.acceptanceRate },
            { key: "resp", header: t("response"), cell: (p) => (p.medianResponseSec === null ? "—" : `${Math.round(p.medianResponseSec)} s`), sortValue: (p) => p.medianResponseSec },
            { key: "comp", header: t("completion"), cell: (p) => pct(p.completionRate), sortValue: (p) => p.completionRate },
            { key: "trips", header: t("trips"), cell: (p) => p.trips, sortValue: (p) => p.trips },
          ]}
        />
        <p className="text-sm text-muted">{t("performanceNote")}</p>
      </section>
      <section>
        <Card className="space-y-3">
          <h2 className="text-lg">{t("demoTitle")}</h2>
          {draft ? (
            <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), saveDemo.mutate(draft))}>
              <Switch checked={draft.demoMode} onChange={(v) => setDraft({ ...draft, demoMode: v })} label={t("demoMode")} description={t("demoModeHint")} />
              <Switch checked={draft.simulateDispatch} onChange={(v) => setDraft({ ...draft, simulateDispatch: v })} label={t("simulate")} description={t("simulateHint")} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("acceptDelay")}>{({ id }) => <Input id={id} type="number" min={2} max={120} value={draft.acceptDelaySec} onChange={(e) => setDraft({ ...draft, acceptDelaySec: Number(e.target.value) })} />}</Field>
                <Field label={t("stepDelay")}>{({ id }) => <Input id={id} type="number" min={2} max={120} value={draft.stepDelaySec} onChange={(e) => setDraft({ ...draft, stepDelaySec: Number(e.target.value) })} />}</Field>
              </div>
              <Button type="submit" loading={saveDemo.isPending}>{t("saveDemo")}</Button>
            </form>
          ) : <TableSkeleton rows={2} />}
        </Card>
      </section>
    </div>
  );
}
