"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuditTable } from "@/components/admin/AuditTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Switch } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/useApiQuery";
import { api } from "@/lib/api";
import { CAPABILITIES, STAFF_PERMISSIONS, type AuditEntry, type Capability, type StaffPermission, type Tier } from "@/lib/schemas";

/** Mutation that refreshes the given queries and toasts the outcome. */
function useSaveMutation<A>(fn: (a: A) => Promise<unknown>, keys: unknown[][]) {
  const qc = useQueryClient();
  const toast = useToast();
  const msg = useApiErrorMessage();
  const t = useTranslations("common");
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of keys) void qc.invalidateQueries({ queryKey: k });
      toast({ title: t("saved"), tone: "success" });
    },
    onError: (e) => toast({ title: msg(e), tone: "error" }),
  });
}

export function VerificationCard({ status, submittedAt, reason, isAdmin }: { status: string; submittedAt: string | null; reason: string | null; isAdmin: boolean }) {
  const t = useTranslations("portal.verification");
  const qc = useQueryClient();
  const msg = useApiErrorMessage();
  const [files, setFiles] = useState<File[]>([]);
  const upload = useMutation({
    mutationFn: async () => {
      const documents = await Promise.all(
        files.map(
          (f) =>
            new Promise<{ name: string; contentType: string; dataUrl: string }>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve({ name: f.name, contentType: f.type, dataUrl: String(r.result) });
              r.onerror = reject;
              r.readAsDataURL(f);
            }),
        ),
      );
      return api.post("/hospital/verification", { documents });
    },
    onSuccess: () => {
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ["hospital-dashboard"] });
    },
  });
  return (
    <Card className="space-y-3">
      <h2 className="text-lg">{t("title")}</h2>
      <p className="font-medium">{t(`status.${status}` as "status.pending")}</p>
      {submittedAt ? <p className="text-sm text-muted">{t("submitted")} <RelativeTime iso={submittedAt} /></p> : null}
      {reason ? <p className="text-sm">{t("reason", { reason })}</p> : null}
      {isAdmin ? (
        <form className="space-y-2" onSubmit={(e) => (e.preventDefault(), files.length && upload.mutate())}>
          <label htmlFor="ver-docs" className="font-medium">{t("upload")}</label>
          <p id="ver-docs-hint" className="text-sm text-muted">{t("uploadHint")}</p>
          <input id="ver-docs" aria-describedby="ver-docs-hint" type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 5))} className="block w-full text-sm" />
          {upload.isError ? <StatusBanner variant="error" title={msg(upload.error)} /> : null}
          {upload.isSuccess ? <StatusBanner variant="info" title={t("uploaded")} /> : null}
          <Button type="submit" variant="secondary" disabled={!files.length} loading={upload.isPending}>
            <Upload aria-hidden="true" className="h-4 w-4" />
            {t("submit")}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">{t("adminOnly")}</p>
      )}
    </Card>
  );
}

type Profile = { name: string; address: string; city: string; lat: number; lng: number; phone: string; operatingHours: string; emergencyHours: string; emergency24x7: boolean };

export function ProfileEditor({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations("portal.profile");
  const q = useApiQuery<Profile>(["hospital-profile"], "/hospital/profile");
  const save = useSaveMutation((p: Partial<Profile>) => api.patch("/hospital/profile", p), [["hospital-profile"], ["hospital-dashboard"]]);
  const [draft, setDraft] = useState<Profile | null>(null);
  const v = draft ?? q.data;
  if (q.isPending) return <TableSkeleton rows={4} />;
  if (q.isError || !v) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const set = <K extends keyof Profile>(k: K, val: Profile[K]) => setDraft({ ...v, [k]: val });
  const text = (k: "name" | "address" | "city" | "phone" | "operatingHours" | "emergencyHours") => (
    <Field label={t(k)}>{({ id }) => <Input id={id} value={v[k]} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} />}</Field>
  );
  return (
    <Card id="profile" className="space-y-3">
      <h2 className="text-lg">{t("title")}</h2>
      {!canEdit ? <p className="text-sm text-muted">{t("readOnly")}</p> : null}
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => (e.preventDefault(), draft && save.mutate(draft, { onSuccess: () => setDraft(null) }))}>
        {text("name")}
        {text("phone")}
        {text("address")}
        {text("city")}
        {text("operatingHours")}
        {text("emergencyHours")}
        <Field label={t("lat")}>{({ id }) => <Input id={id} type="number" step="0.00001" value={v.lat} disabled={!canEdit} onChange={(e) => set("lat", Number(e.target.value))} />}</Field>
        <Field label={t("lng")}>{({ id }) => <Input id={id} type="number" step="0.00001" value={v.lng} disabled={!canEdit} onChange={(e) => set("lng", Number(e.target.value))} />}</Field>
        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            className="md:col-span-2 justify-self-start"
            onClick={() => navigator.geolocation?.getCurrentPosition((p) => setDraft({ ...v, lat: Number(p.coords.latitude.toFixed(5)), lng: Number(p.coords.longitude.toFixed(5)) }))}
          >
            {t("pinHere")}
          </Button>
        ) : null}
        <div className="md:col-span-2">
          <Switch checked={v.emergency24x7} disabled={!canEdit} onChange={(x) => set("emergency24x7", x)} label={t("emergency24x7")} />
        </div>
        {canEdit ? <Button type="submit" disabled={!draft} loading={save.isPending} className="md:col-span-2 justify-self-start">{t("save")}</Button> : null}
      </form>
    </Card>
  );
}

type FacilityRow = { capability: Capability; present: boolean; confirmed: boolean; lastVerifiedAt: string | null; tier: Tier | null };

export function FacilitiesManager() {
  const t = useTranslations("portal.facilities");
  const cap = useTranslations("capabilities");
  const q = useApiQuery<{ items: FacilityRow[]; canManage: boolean }>(["hospital-facilities"], "/hospital/facilities");
  const save = useSaveMutation((b: { capability: Capability; present: boolean }) => api.post("/hospital/facilities", b), [["hospital-facilities"], ["hospital-dashboard"]]);
  if (q.isPending) return <TableSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const by = new Map(q.data.items.map((f) => [f.capability, f]));
  return (
    <Card id="facilities" className="space-y-3">
      <h2 className="text-lg">{t("title")}</h2>
      <p className="text-sm text-muted">{t("note")}</p>
      <ul className="divide-y divide-border">
        {CAPABILITIES.map((c) => {
          const f = by.get(c);
          return (
            <li key={c} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div>
                <p className="font-medium">{cap(c)}</p>
                {f?.lastVerifiedAt ? <p className="text-sm text-muted">{t("lastVerified")} <RelativeTime iso={f.lastVerifiedAt} /></p> : null}
              </div>
              <div className="flex items-center gap-3">
                {f?.present && f.tier ? <ConfidenceBadge tier={f.tier} size="sm" /> : <span className="text-sm text-muted">{t("notListed")}</span>}
                {q.data.canManage ? (
                  <Button size="sm" variant={f?.present ? "outline" : "secondary"} loading={save.isPending && save.variables?.capability === c} onClick={() => save.mutate({ capability: c, present: !f?.present })}>
                    {f?.present ? t("markAbsent") : t("declare")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

type Rec = { id: string; name: string; specialty?: string; onDuty?: boolean; confirmed: boolean };

export function RecordsManager({ kind, canManage, canToggleDuty }: { kind: "departments" | "specialists"; canManage: boolean; canToggleDuty: boolean }) {
  const t = useTranslations("portal.records");
  const q = useApiQuery<{ items: Rec[] }>([`hospital-${kind}`], `/hospital/${kind}`);
  const keys = [[`hospital-${kind}`], ["hospital-dashboard"]];
  const create = useSaveMutation((b: { name: string; specialty?: string }) => api.post(`/hospital/${kind}`, b), keys);
  const update = useSaveMutation(({ id, ...p }: { id: string; onDuty: boolean }) => api.patch(`/hospital/${kind}/${id}`, p), keys);
  const remove = useSaveMutation((id: string) => api.delete(`/hospital/${kind}/${id}`), keys);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  if (q.isPending) return <TableSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <Card id={kind} className="space-y-3">
      <h2 className="text-lg">{t(`${kind}.title`)}</h2>
      <ul className="divide-y divide-border">
        {q.data.items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div>
              <p className="font-medium">{r.name}{r.specialty ? ` · ${r.specialty}` : ""}</p>
              <p className="text-sm text-muted">{r.confirmed ? t("confirmed") : t("pendingVerification")}</p>
            </div>
            <div className="flex items-center gap-2">
              {kind === "specialists" && canToggleDuty ? <Switch checked={!!r.onDuty} onChange={(v) => update.mutate({ id: r.id, onDuty: v })} label={t("onDuty")} /> : null}
              {canManage ? (
                <ConfirmDialog
                  trigger={<Button size="icon" variant="ghost" aria-label={t("remove", { name: r.name })}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}
                  title={t("removeTitle", { name: r.name })}
                  confirmLabel={t("removeConfirm")}
                  destructive
                  onConfirm={() => remove.mutateAsync(r.id)}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canManage ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), name.trim().length >= 2 && create.mutate({ name: name.trim(), specialty: specialty.trim() || undefined }, { onSuccess: () => (setName(""), setSpecialty("")) }))}>
          <Field label={t("name")} className="flex-1">{({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          {kind === "specialists" ? <Field label={t("specialty")} className="flex-1">{({ id }) => <Input id={id} value={specialty} onChange={(e) => setSpecialty(e.target.value)} />}</Field> : null}
          <Button type="submit" variant="secondary" loading={create.isPending}><Plus aria-hidden="true" className="h-4 w-4" />{t("add")}</Button>
        </form>
      ) : null}
    </Card>
  );
}

type Staff = { id: string; displayName: string; email: string | null; role: string; permissions: StaffPermission[]; status: string };

export function StaffTable() {
  const t = useTranslations("portal.staff");
  const q = useApiQuery<{ items: Staff[] }>(["hospital-staff"], "/hospital/staff");
  const invite = useSaveMutation((b: { email: string; displayName: string; permissions: StaffPermission[] }) => api.post("/hospital/staff", b), [["hospital-staff"]]);
  const patch = useSaveMutation(({ id, ...b }: { id: string; permissions?: StaffPermission[]; status?: "active" | "disabled" }) => api.patch(`/hospital/staff/${id}`, b), [["hospital-staff"]]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<StaffPermission[]>(["updateAvailability", "respondRequests"]);
  if (q.isPending) return <TableSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <Card id="staff" className="space-y-3">
      <h2 className="text-lg">{t("title")}</h2>
      <ul className="divide-y divide-border">
        {q.data.items.map((s) => (
          <li key={s.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{s.displayName} <span className="text-sm text-muted">· {s.email} · {t(`status.${s.status}` as "status.active")}</span></p>
              {s.role === "hospital_staff" ? (
                <Button size="sm" variant={s.status === "disabled" ? "secondary" : "danger"} onClick={() => patch.mutate({ id: s.id, status: s.status === "disabled" ? "active" : "disabled" })}>
                  {s.status === "disabled" ? t("enable") : t("disable")}
                </Button>
              ) : <span className="text-sm text-muted">{t("admin")}</span>}
            </div>
            {s.role === "hospital_staff" ? (
              <fieldset className="flex flex-wrap gap-x-4">
                <legend className="sr-only">{t("permissionsFor", { name: s.displayName })}</legend>
                {STAFF_PERMISSIONS.map((p) => (
                  <Checkbox key={p} label={t(`perm.${p}`)} checked={s.permissions.includes(p)} onChange={(e) => patch.mutate({ id: s.id, permissions: e.target.checked ? [...s.permissions, p] : s.permissions.filter((x) => x !== p) })} />
                ))}
              </fieldset>
            ) : null}
          </li>
        ))}
      </ul>
      <form className="space-y-2 rounded-control border border-border p-3" onSubmit={(e) => (e.preventDefault(), invite.mutate({ email, displayName: name, permissions: perms }, { onSuccess: () => (setEmail(""), setName("")) }))}>
        <h3>{t("invite")}</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <Field label={t("name")}>{({ id }) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t("email")}>{({ id }) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        </div>
        <fieldset className="flex flex-wrap gap-x-4">
          <legend className="font-medium">{t("permissions")}</legend>
          {STAFF_PERMISSIONS.map((p) => (
            <Checkbox key={p} label={t(`perm.${p}`)} checked={perms.includes(p)} onChange={(e) => setPerms(e.target.checked ? [...perms, p] : perms.filter((x) => x !== p))} />
          ))}
        </fieldset>
        <Button type="submit" variant="secondary" loading={invite.isPending}><UserPlus aria-hidden="true" className="h-4 w-4" />{t("send")}</Button>
      </form>
    </Card>
  );
}

export function RecentAudit() {
  const t = useTranslations("portal.audit");
  const q = useApiQuery<{ items: AuditEntry[] }>(["hospital-audit"], "/hospital/audit-logs");
  return (
    <Card className="space-y-3">
      <h2 className="text-lg">{t("title")}</h2>
      {q.isPending ? <TableSkeleton rows={3} /> : q.isError ? <ErrorState error={q.error} /> : <AuditTable items={q.data.items.slice(0, 10)} />}
    </Card>
  );
}
