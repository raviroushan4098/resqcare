"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Truck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/admin/DataTable";
import { DemoBanner } from "@/components/ambulance/DemoBanner";
import { LazyMap } from "@/components/maps/LazyMap";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageShell } from "@/components/shared/PageShell";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { KpiTile } from "@/components/admin/KpiTile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/useApiQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, isApiError } from "@/lib/api";
import type { AmbulanceType, BookingStatus } from "@/lib/schemas";

type Row = {
  id: string; status: BookingStatus; type: AmbulanceType; demo: boolean; patientCount: number; pickup: { lat: number; lng: number; address: string | null };
  destinationName: string | null; createdAt: string; expiresAt: string | null; contactMasked: string; ambulanceId: string | null; driverId: string | null; lastLocation: { lat: number; lng: number; at: string } | null;
};
type Fleet = {
  provider: { name: string; serviceArea: { center: { lat: number; lng: number }; radiusKm: number } } | null;
  ambulances: { id: string; registration: string; type: AmbulanceType; driverId: string | null; status: "available" | "busy" | "offline"; currentBookingId: string | null }[];
  drivers: { id: string; displayName: string; phoneMasked: string; status: string }[];
};

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const s = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  return <span className={s < 30 ? "font-bold text-emergency" : ""}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

function Dispatcher() {
  const t = useTranslations("dispatch");
  const ty = useTranslations("ambulanceTypes");
  const st = useTranslations("booking.status");
  usePageTitle(t("title"));
  const qc = useQueryClient();
  const toast = useToast();
  const msg = useApiErrorMessage();
  const queue = useApiQuery<{ incoming: Row[]; active: Row[] }>(["provider-queue"], "/provider/requests", { refetchInterval: 3000 });
  const fleet = useApiQuery<Fleet>(["provider-fleet"], "/provider/ambulances", { refetchInterval: 10_000 });
  const stats = useApiQuery<{ accepted: number; rejected: number; completed: number; active: number }>(["provider-stats"], "/provider/stats", { refetchInterval: 15_000 });
  const [assignFor, setAssignFor] = useState<Row | null>(null);
  const [rejectFor, setRejectFor] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [amb, setAmb] = useState("");
  const [drv, setDrv] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const refresh = () => ["provider-queue", "provider-fleet", "provider-stats"].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  const accept = useMutation({ mutationFn: (id: string) => api.post(`/provider/bookings/${id}/accept`), onSuccess: refresh, onError: (e) => (toast({ title: msg(e), tone: "error" }), refresh()) });
  const reject = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/provider/bookings/${id}/reject`, { reason }), onSuccess: () => (setRejectFor(null), setReason(""), refresh()), onError: (e) => toast({ title: msg(e), tone: "error" }) });
  const assign = useMutation({
    mutationFn: () => api.post(`/provider/bookings/${assignFor!.id}/assign`, { ambulanceId: amb, driverId: drv }),
    onSuccess: () => (setAssignFor(null), setAmb(""), setDrv(""), setAssignError(null), refresh()),
    onError: (e) => {
      setAssignError(isApiError(e) && e.code === "CONFLICT" ? t("vehicleTaken") : msg(e));
      refresh();
    },
  });
  const addVehicle = useMutation({ mutationFn: (b: { registration: string; type: AmbulanceType; driverId: string | null }) => api.post("/provider/ambulances", b), onSuccess: refresh, onError: (e) => toast({ title: msg(e), tone: "error" }) });
  const setVehicle = useMutation({ mutationFn: ({ id, ...b }: { id: string; status?: "available" | "offline"; driverId?: string | null }) => api.patch(`/provider/ambulances/${id}`, b), onSuccess: refresh, onError: (e) => toast({ title: msg(e), tone: "error" }) });
  const addDriver = useMutation({ mutationFn: (b: { displayName: string; phone: string }) => api.post("/provider/drivers", b), onSuccess: refresh, onError: (e) => toast({ title: msg(e), tone: "error" }) });
  const area = useMutation({ mutationFn: (b: { center: { lat: number; lng: number }; radiusKm: number }) => api.patch("/provider/service-area", b), onSuccess: () => (refresh(), toast({ title: t("areaSaved"), tone: "success" })), onError: (e) => toast({ title: msg(e), tone: "error" }) });
  const [reg, setReg] = useState("");
  const [regType, setRegType] = useState<AmbulanceType>("basic");
  const [dName, setDName] = useState("");
  const [dPhone, setDPhone] = useState("");
  const [radius, setRadius] = useState<number | null>(null);

  const available = (fleet.data?.ambulances ?? []).filter((a) => a.status === "available");
  const busyDrivers = new Set((fleet.data?.ambulances ?? []).filter((a) => a.status === "busy").map((a) => a.driverId));
  const freeDrivers = (fleet.data?.drivers ?? []).filter((d) => !busyDrivers.has(d.id) && d.status !== "disabled");

  return (
    <div className="space-y-6">
      <DemoBanner />
      <PageHeader title={t("title")} description={fleet.data?.provider?.name} />
      <div className="grid gap-3 sm:grid-cols-4">
        {(["accepted", "rejected", "completed", "active"] as const).map((k) => <KpiTile key={k} label={t(`stats.${k}`)} value={stats.data?.[k] ?? null} definition={t(`statsDef.${k}`)} loading={stats.isPending} error={stats.isError} />)}
      </div>

      <section aria-labelledby="incoming" className="space-y-3">
        <h2 id="incoming">{t("incoming")}</h2>
        {queue.isPending ? <TableSkeleton rows={2} /> : queue.isError ? <ErrorState error={queue.error} onRetry={() => void queue.refetch()} /> : queue.data.incoming.length === 0 ? (
          <EmptyState title={t("noIncoming")} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2" aria-live="polite">
            {queue.data.incoming.map((r) => (
              <li key={r.id}>
                <Card className="space-y-2 border-2 border-primary">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold">{ty(r.type)} · {t("patients", { count: r.patientCount })}</p>
                    {r.expiresAt ? <p className="text-sm">{t("expiresIn")} <Countdown until={r.expiresAt} /></p> : null}
                  </div>
                  <p className="text-sm">{t("pickup")}: {r.pickup.address ?? `${r.pickup.lat.toFixed(3)}, ${r.pickup.lng.toFixed(3)}`}</p>
                  <p className="text-sm">{t("destination")}: {r.destinationName ?? t("nearest")}</p>
                  <p className="text-sm text-muted">{t("received")} <RelativeTime iso={r.createdAt} /> · {r.contactMasked}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="positive" size="lg" loading={accept.isPending && accept.variables === r.id} onClick={() => accept.mutate(r.id)}><Check aria-hidden="true" className="h-5 w-5" />{t("accept")}</Button>
                    <Button variant="danger" size="lg" onClick={() => setRejectFor(r)}><X aria-hidden="true" className="h-5 w-5" />{t("reject")}</Button>
                  </div>
                  {available.length === 0 ? <p className="text-sm font-medium text-reported-text">{t("noVehicles")}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="active" className="space-y-3">
        <h2 id="active">{t("active")}</h2>
        {queue.data?.active.length ? (
          <>
            <ul className="space-y-2">
              {queue.data.active.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-3">
                  <div>
                    <p className="font-semibold">{st(r.status)} · {ty(r.type)}</p>
                    <p className="text-sm text-muted">{r.destinationName ?? t("nearest")} · {r.ambulanceId ? (fleet.data?.ambulances.find((a) => a.id === r.ambulanceId)?.registration ?? "") : t("unassigned")}</p>
                  </div>
                  {r.status === "Accepted" ? <Button onClick={() => (setAssignFor(r), setAssignError(null))}><Truck aria-hidden="true" className="h-4 w-4" />{t("assign")}</Button> : null}
                </li>
              ))}
            </ul>
            <LazyMap
              center={fleet.data?.provider?.serviceArea.center ?? { lat: 28.47, lng: 77.5 }}
              zoom={11}
              markers={queue.data.active.flatMap((r) => [
                { id: `p-${r.id}`, lat: r.pickup.lat, lng: r.pickup.lng, title: t("pickup"), kind: "pickup" as const },
                ...(r.lastLocation ? [{ id: `a-${r.id}`, lat: r.lastLocation.lat, lng: r.lastLocation.lng, title: t("vehicle"), kind: "ambulance" as const }] : []),
              ])}
              label={t("mapLabel")}
            />
          </>
        ) : <EmptyState title={t("noActive")} />}
      </section>

      <section aria-labelledby="fleet" className="space-y-3">
        <h2 id="fleet">{t("fleet")}</h2>
        <DataTable
          caption={t("fleet")}
          loading={fleet.isPending}
          rows={fleet.data?.ambulances ?? []}
          rowId={(a) => a.id}
          rowLabel={(a) => a.registration}
          columns={[
            { key: "reg", header: t("registration"), cell: (a) => a.registration, sortValue: (a) => a.registration, filterValue: (a) => a.registration },
            { key: "type", header: t("type"), cell: (a) => ty(a.type), sortValue: (a) => a.type },
            { key: "driver", header: t("driver"), cell: (a) => fleet.data?.drivers.find((d) => d.id === a.driverId)?.displayName ?? "—", filterValue: (a) => fleet.data?.drivers.find((d) => d.id === a.driverId)?.displayName ?? "" },
            { key: "status", header: t("status"), cell: (a) => t(`vehicleStatus.${a.status}`), sortValue: (a) => a.status, filterValue: (a) => a.status },
            {
              key: "actions", header: t("actions"),
              cell: (a) => a.status === "busy" ? <span className="text-sm text-muted">{t("onTrip")}</span> : (
                <Button size="sm" variant="outline" onClick={() => setVehicle.mutate({ id: a.id, status: a.status === "available" ? "offline" : "available" })}>
                  {a.status === "available" ? t("setOffline") : t("setAvailable")}
                </Button>
              ),
            },
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <form className="space-y-2 rounded-card border border-border bg-surface p-3" onSubmit={(e) => (e.preventDefault(), reg.trim().length >= 4 && addVehicle.mutate({ registration: reg.trim().toUpperCase(), type: regType, driverId: null }, { onSuccess: () => setReg("") }))}>
            <h3>{t("addVehicle")}</h3>
            <Field label={t("registration")}>{({ id }) => <Input id={id} value={reg} onChange={(e) => setReg(e.target.value)} />}</Field>
            <Field label={t("type")}>{({ id }) => <Select id={id} value={regType} onChange={(e) => setRegType(e.target.value as AmbulanceType)}><option value="basic">{ty("basic")}</option><option value="als">{ty("als")}</option></Select>}</Field>
            <Button type="submit" variant="secondary" loading={addVehicle.isPending}><Plus aria-hidden="true" className="h-4 w-4" />{t("add")}</Button>
          </form>
          <form className="space-y-2 rounded-card border border-border bg-surface p-3" onSubmit={(e) => (e.preventDefault(), addDriver.mutate({ displayName: dName, phone: dPhone }, { onSuccess: () => (setDName(""), setDPhone("")) }))}>
            <h3>{t("addDriver")}</h3>
            <Field label={t("driverName")}>{({ id }) => <Input id={id} value={dName} required onChange={(e) => setDName(e.target.value)} />}</Field>
            <Field label={t("driverPhone")}>{({ id }) => <Input id={id} type="tel" value={dPhone} required onChange={(e) => setDPhone(e.target.value)} />}</Field>
            <Button type="submit" variant="secondary" loading={addDriver.isPending}><Plus aria-hidden="true" className="h-4 w-4" />{t("add")}</Button>
          </form>
          <form className="space-y-2 rounded-card border border-border bg-surface p-3" onSubmit={(e) => (e.preventDefault(), fleet.data?.provider && area.mutate({ center: fleet.data.provider.serviceArea.center, radiusKm: radius ?? fleet.data.provider.serviceArea.radiusKm }))}>
            <h3>{t("serviceArea")}</h3>
            <p className="text-sm text-muted">{t("serviceAreaHint")}</p>
            <Field label={t("radiusKm")}>{({ id }) => <Input id={id} type="number" min={1} max={100} value={radius ?? fleet.data?.provider?.serviceArea.radiusKm ?? 10} onChange={(e) => setRadius(Number(e.target.value))} />}</Field>
            <Button type="submit" variant="secondary" loading={area.isPending}>{t("saveArea")}</Button>
          </form>
        </div>
        <Card>
          <h3 className="mb-2">{t("drivers")}</h3>
          <ul className="divide-y divide-border">{fleet.data?.drivers.map((d) => <li key={d.id} className="flex justify-between py-2"><span>{d.displayName}</span><span className="text-sm text-muted">{d.phoneMasked} · {d.status}</span></li>)}</ul>
        </Card>
      </section>

      <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent title={t("assignTitle")} description={t("assignBody")}>
          <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), amb && drv && assign.mutate())}>
            {available.length === 0 ? <StatusBanner variant="info" title={t("noVehicles")} /> : null}
            <Field label={t("vehicle")}>{({ id }) => (
              <Select id={id} value={amb} onChange={(e) => { setAmb(e.target.value); const a = available.find((x) => x.id === e.target.value); if (a?.driverId && freeDrivers.some((d) => d.id === a.driverId)) setDrv(a.driverId); }}>
                <option value="">{t("chooseVehicle")}</option>
                {available.map((a) => <option key={a.id} value={a.id}>{a.registration} · {ty(a.type)}</option>)}
              </Select>
            )}</Field>
            <Field label={t("driver")}>{({ id }) => (
              <Select id={id} value={drv} onChange={(e) => setDrv(e.target.value)}>
                <option value="">{t("chooseDriver")}</option>
                {freeDrivers.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
              </Select>
            )}</Field>
            {assignError ? <StatusBanner variant="error" title={assignError} /> : null}
            <Button type="submit" block disabled={!amb || !drv} loading={assign.isPending}>{t("confirmAssign")}</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent title={t("rejectTitle")}>
          <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), rejectFor && reason.trim().length >= 3 && reject.mutate({ id: rejectFor.id, reason: reason.trim() }))}>
            <Field label={t("rejectReason")} required>{({ id }) => <Textarea id={id} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}</Field>
            <Button type="submit" variant="danger" block disabled={reason.trim().length < 3} loading={reject.isPending}>{t("confirmReject")}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProviderDashboardPage() {
  return (
    <PageShell audience="portal" width="wide">
      <ProtectedRoute roles={["dispatcher"]}>
        <Dispatcher />
      </ProtectedRoute>
    </PageShell>
  );
}
