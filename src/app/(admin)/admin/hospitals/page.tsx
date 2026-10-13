"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { DataTable } from "@/components/admin/DataTable";
import { VerificationPanel, type VerificationDetail } from "@/components/admin/VerificationPanel";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { ProfileSkeleton } from "@/components/shared/Skeletons";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { ReviewCard } from "@/components/trust/ReviewCard";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/useApiQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import type { ReviewView, Tier, VerificationState, VerifyDecision } from "@/lib/schemas";

type Row = { id: string; name: string; city: string; verificationStatus: VerificationState; verifiedAt: string | null; registryRef: string | null; availabilityUpdatedAt: string | null; freshness: Tier; openFlags: number };
type Flag = { id: string; hospitalId: string; hospitalName: string; field: string; description: string; status: string; createdAt: string };

function AdminHospitalsView() {
  const t = useTranslations("admin.hospitals");
  const v = useTranslations("verification");
  usePageTitle(t("title"));
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const msg = useApiErrorMessage();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const list = useApiQuery<{ items: Row[] }>(["admin-hospitals", status], "/admin/hospitals", { query: { status: status || undefined } });
  const flags = useApiQuery<{ items: Flag[] }>(["admin-flags"], "/admin/flags", { query: { status: "open" } });
  const reviews = useApiQuery<{ pending: ReviewView[]; reported: ReviewView[] }>(["admin-reviews"], "/admin/reviews");
  const detail = useQuery({ queryKey: ["admin-hospital", openId], enabled: !!openId, queryFn: async () => (await api.get<VerificationDetail>(`/admin/hospitals/${openId}`)).data });
  const resolve = useMutation({ mutationFn: ({ id, text }: { id: string; text: string }) => api.post(`/admin/flags/${id}/resolve`, { resolution: text }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-flags"] }), onError: (e) => toast({ title: msg(e), tone: "error" }) });
  const moderate = useMutation({ mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" | "remove" }) => api.post(`/admin/reviews/${id}/moderate`, { decision }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-reviews"] }), onError: (e) => toast({ title: msg(e), tone: "error" }) });
  const tab = params.get("tab") ?? "hospitals";

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} />
      <Tabs defaultValue={tab}>
        <TabsList aria-label={t("tabs")}>
          <TabsTrigger value="hospitals">{t("tabHospitals")}</TabsTrigger>
          <TabsTrigger value="flags">{t("tabFlags", { count: flags.data?.items.length ?? 0 })}</TabsTrigger>
          <TabsTrigger value="reviews">{t("tabReviews", { count: (reviews.data?.pending.length ?? 0) + (reviews.data?.reported.length ?? 0) })}</TabsTrigger>
        </TabsList>
        <TabsContent value="hospitals" className="mt-4 space-y-3">
          <div className="max-w-xs">
            <label htmlFor="ah-status" className="font-medium">{t("status")}</label>
            <Select id="ah-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("all")}</option>
              {(["pending", "approved", "unverified", "rejected", "suspended"] as const).map((s) => <option key={s} value={s}>{v(s)}</option>)}
            </Select>
          </div>
          {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : (
            <DataTable
              caption={t("title")}
              loading={list.isPending}
              rows={list.data?.items ?? []}
              rowId={(r) => r.id}
              rowLabel={(r) => r.name}
              onRowClick={(r) => setOpenId(r.id)}
              columns={[
                { key: "name", header: t("name"), cell: (r) => r.name, sortValue: (r) => r.name, filterValue: (r) => `${r.name} ${r.registryRef ?? ""}` },
                { key: "status", header: t("status"), cell: (r) => <VerifiedBadge state={r.verificationStatus} />, sortValue: (r) => r.verificationStatus },
                { key: "fresh", header: t("freshness"), cell: (r) => <ConfidenceBadge tier={r.freshness} updatedAt={r.availabilityUpdatedAt} size="sm" />, sortValue: (r) => r.availabilityUpdatedAt ?? "" },
                { key: "flags", header: t("flags"), cell: (r) => r.openFlags, sortValue: (r) => r.openFlags },
              ]}
            />
          )}
        </TabsContent>
        <TabsContent value="flags" className="mt-4 space-y-3">
          {flags.data?.items.length ? flags.data.items.map((f) => (
            <Card key={f.id} className="space-y-2">
              <p className="font-semibold">{f.hospitalName} · {t(`flagField.${f.field as "other"}`)}</p>
              <p>{f.description}</p>
              <p className="text-sm text-muted"><RelativeTime iso={f.createdAt} /></p>
              <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), (resolution[f.id] ?? "").trim().length >= 3 && resolve.mutate({ id: f.id, text: resolution[f.id]!.trim() }))}>
                <label htmlFor={`res-${f.id}`} className="sr-only">{t("resolution")}</label>
                <Input id={`res-${f.id}`} placeholder={t("resolution")} value={resolution[f.id] ?? ""} onChange={(e) => setResolution({ ...resolution, [f.id]: e.target.value })} className="flex-1" />
                <Button type="submit" variant="secondary">{t("resolve")}</Button>
              </form>
            </Card>
          )) : <p className="text-muted">{t("noFlags")}</p>}
        </TabsContent>
        <TabsContent value="reviews" className="mt-4 space-y-4">
          {(["pending", "reported"] as const).map((k) => (
            <section key={k} className="space-y-2">
              <h2 className="text-lg">{t(`reviews.${k}`)}</h2>
              {reviews.data?.[k].length ? reviews.data[k].map((r) => (
                <div key={r.id} className="space-y-2">
                  <ReviewCard review={r} />
                  <div className="flex flex-wrap gap-2">
                    {k === "pending" ? <Button size="sm" variant="positive" onClick={() => moderate.mutate({ id: r.id, decision: "approve" })}>{t("approve")}</Button> : null}
                    {k === "pending" ? <Button size="sm" variant="danger" onClick={() => moderate.mutate({ id: r.id, decision: "reject" })}>{t("rejectReview")}</Button> : null}
                    {k === "reported" ? <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: r.id, decision: "approve" })}>{t("keep")}</Button> : null}
                    {k === "reported" ? <Button size="sm" variant="danger" onClick={() => moderate.mutate({ id: r.id, decision: "remove" })}>{t("remove")}</Button> : null}
                  </div>
                </div>
              )) : <p className="text-muted">{t("noReviews")}</p>}
            </section>
          ))}
        </TabsContent>
      </Tabs>
      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent title={detail.data?.hospital.name ?? t("detail")} side="right">
          {detail.isPending ? <ProfileSkeleton /> : detail.isError ? <ErrorState error={detail.error} /> : (
            <VerificationPanel
              detail={detail.data}
              onDecide={async (d: VerifyDecision) => {
                await api.post(`/admin/hospitals/${openId}/verify`, d);
                toast({ title: t("decided"), tone: "success" });
                void qc.invalidateQueries({ queryKey: ["admin-hospital", openId] });
                void qc.invalidateQueries({ queryKey: ["admin-hospitals"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminHospitalsPage() {
  return (
    <Suspense>
      <AdminHospitalsView />
    </Suspense>
  );
}
