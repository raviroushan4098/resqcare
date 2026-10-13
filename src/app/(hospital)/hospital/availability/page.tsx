"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudOff, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { StatStepper } from "@/components/portal/StatStepper";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionDenied } from "@/components/shared/ProtectedRoute";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { ProfileSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Switch } from "@/components/ui/field";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useOnline } from "@/hooks/useOnline";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useRole } from "@/hooks/useRole";
import { api, isApiError } from "@/lib/api";
import type { AvailabilityUpdate, PortalAvailability } from "@/lib/schemas";

type Bed = "icuBeds" | "emergencyBeds" | "ventilators";
const BEDS: Bed[] = ["icuBeds", "emergencyBeds", "ventilators"];
const QUEUE_KEY = "rq-pending-availability";

const readQueue = (): AvailabilityUpdate | null => {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeQueue = (v: AvailabilityUpdate | null) => {
  try {
    if (v) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* queue is best effort */
  }
};

export default function AvailabilityPage() {
  const t = useTranslations("portal.availability");
  const a = useTranslations("availability");
  usePageTitle(t("title"));
  const { hasPermission } = useRole();
  const msg = useApiErrorMessage();
  const online = useOnline();
  const qc = useQueryClient();
  const q = useApiQuery<{ current: PortalAvailability; freshnessMinutes: number }>(["hospital-availability"], "/hospital/availability");
  const history = useApiQuery<{ items: { id: string; at: string; byName: string | null; icuBeds: { available: number } | null; emergencyBeds: { available: number } | null; ventilators: { available: number } | null }[] }>(["hospital-availability-history"], "/hospital/availability/history");
  const [draft, setDraft] = useState<AvailabilityUpdate | null>(null);
  const [conflict, setConflict] = useState<PortalAvailability | null>(null);
  const [pending, setPending] = useState<AvailabilityUpdate | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setPending(readQueue()), []);
  useEffect(() => {
    if (q.data && !draft) {
      const c = q.data.current;
      setDraft({ icuBeds: c.icuBeds, emergencyBeds: c.emergencyBeds, ventilators: c.ventilators, servicesNow: c.servicesNow, expectedVersion: c.version });
    }
  }, [q.data, draft]);

  const save = useMutation({
    mutationFn: (body: AvailabilityUpdate) => api.put<{ current: PortalAvailability }>("/hospital/availability", body),
    onSuccess: (res) => {
      writeQueue(null);
      setPending(null);
      setConflict(null);
      setSaved(true);
      const c = res.data.current;
      setDraft({ icuBeds: c.icuBeds, emergencyBeds: c.emergencyBeds, ventilators: c.ventilators, servicesNow: c.servicesNow, expectedVersion: c.version });
      void qc.invalidateQueries({ queryKey: ["hospital-availability"] });
      void qc.invalidateQueries({ queryKey: ["hospital-availability-history"] });
      void qc.invalidateQueries({ queryKey: ["hospital-dashboard"] });
    },
    onError: async (e, body) => {
      if (isApiError(e) && e.code === "CONFLICT") {
        const latest = await qc.fetchQuery({ queryKey: ["hospital-availability"], queryFn: async () => (await api.get<{ current: PortalAvailability; freshnessMinutes: number }>("/hospital/availability")).data });
        setConflict(latest.current);
      } else if (isApiError(e) && e.code === "NETWORK_ERROR") {
        writeQueue(body);
        setPending(body);
      }
    },
  });

  // Flush a queued update when the connection returns.
  useEffect(() => {
    if (online && pending && !save.isPending) save.mutate(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  if (!hasPermission("updateAvailability")) return <PermissionDenied />;
  if (q.isPending || !draft) return <ProfileSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const cur = q.data.current;

  const setBed = (k: Bed, patch: Partial<{ available: number; total: number }>) => {
    setSaved(false);
    const next = { ...draft[k], ...patch };
    next.available = Math.min(next.available, next.total);
    setDraft({ ...draft, [k]: next });
  };
  const warnFor = (k: Bed) => {
    const prev = cur[k].available;
    const diff = Math.abs(draft[k].available - prev);
    return draft[k].total > 0 && diff / draft[k].total > 0.5 ? t("bigChange", { from: prev, to: draft[k].available }) : null;
  };
  const submit = () => {
    setSaved(false);
    if (!online) {
      writeQueue(draft);
      setPending(draft);
      return;
    }
    save.mutate(draft);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-wrap items-center gap-3">
        <ConfidenceBadge tier={cur.tier} updatedAt={cur.updatedAt} label={t("current")} />
        {cur.updatedAt ? <span className="text-sm text-muted">{t("lastBy", { name: cur.updatedByName ?? "—" })}</span> : null}
      </div>
      {pending ? <StatusBanner variant="offline" title={t("pendingTitle")} description={t("pendingBody")} action={<CloudOff aria-hidden="true" className="h-5 w-5" />} /> : null}
      {conflict ? (
        <StatusBanner
          variant="error"
          title={t("conflictTitle")}
          description={t("conflictBody", { icu: conflict.icuBeds.available, er: conflict.emergencyBeds.available, vent: conflict.ventilators.available, name: conflict.updatedByName ?? "—" })}
          action={<Button size="sm" onClick={() => (setDraft({ ...draft, expectedVersion: conflict.version }), setConflict(null))}>{t("reapply")}</Button>}
        />
      ) : null}
      {save.isError && !conflict && !pending ? <StatusBanner variant="error" title={msg(save.error)} /> : null}
      {saved ? <StatusBanner variant="info" title={t("saved")} /> : null}

      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), submit())}>
        <div className="grid gap-4 md:grid-cols-3">
          {BEDS.map((k) => (
            <StatStepper key={k} label={a(k === "icuBeds" ? "icu" : k === "emergencyBeds" ? "emergency" : "ventilators")} value={draft[k].available} max={draft[k].total} previous={cur[k].available} warn={warnFor(k)} onChange={(v) => setBed(k, { available: v })} />
          ))}
        </div>
        <details className="rounded-card border border-border bg-surface p-4">
          <summary className="min-h-touch cursor-pointer font-semibold">{t("capacity")}</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {BEDS.map((k) => (
              <div key={k}>
                <label htmlFor={`cap-${k}`} className="font-medium">{t(`total.${k}`)}</label>
                <Input id={`cap-${k}`} type="number" min={0} max={500} value={draft[k].total} onChange={(e) => setBed(k, { total: Math.max(0, Number(e.target.value)) })} />
              </div>
            ))}
          </div>
        </details>
        <Card className="space-y-1">
          <h2 className="text-lg">{t("services")}</h2>
          {(["ct", "cathLab", "specialistOnDuty"] as const).map((k) => (
            <Switch key={k} checked={draft.servicesNow[k]} onChange={(v) => (setSaved(false), setDraft({ ...draft, servicesNow: { ...draft.servicesNow, [k]: v } }))} label={t(`service.${k}`)} />
          ))}
        </Card>
        <Button type="submit" size="xl" block loading={save.isPending}>
          <Save aria-hidden="true" className="h-6 w-6" />
          {t("confirm")}
        </Button>
        <p className="text-sm text-muted">{t("serverTime")}</p>
      </form>

      <Card>
        <h2 className="mb-2 text-lg">{t("history")}</h2>
        {history.isPending ? null : history.isError ? <ErrorState error={history.error} /> : (
          <div className="overflow-x-auto" role="region" aria-label={t("history")} tabIndex={0}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t("history")}</caption>
              <thead><tr><th scope="col" className="p-2">{t("when")}</th><th scope="col" className="p-2">{a("icu")}</th><th scope="col" className="p-2">{a("emergency")}</th><th scope="col" className="p-2">{a("ventilators")}</th><th scope="col" className="p-2">{t("by")}</th></tr></thead>
              <tbody>
                {history.data.items.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="p-2"><RelativeTime iso={h.at} /></td>
                    <td className="p-2">{h.icuBeds?.available ?? "—"}</td>
                    <td className="p-2">{h.emergencyBeds?.available ?? "—"}</td>
                    <td className="p-2">{h.ventilators?.available ?? "—"}</td>
                    <td className="p-2">{h.byName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
