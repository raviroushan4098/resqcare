"use client";

import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageShell } from "@/components/shared/PageShell";
import { LoadingRegion, ResultCardSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { OpinionDisclaimer } from "@/components/trust/OpinionDisclaimer";
import { ReviewCard } from "@/components/trust/ReviewCard";
import { ReviewForm } from "@/components/trust/ReviewForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Select } from "@/components/ui/field";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { HospitalSummary, ReviewView } from "@/lib/schemas";

function ReviewsView() {
  const t = useTranslations("reviews");
  usePageTitle(t("title"));
  const params = useSearchParams();
  const { status, me } = useAuth();
  const msg = useApiErrorMessage();
  const [hospitalId, setHospitalId] = useState(params.get("hospitalId") ?? "");
  const [rating, setRating] = useState("");
  const [verifiedVisit, setVerifiedVisit] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("abusive");

  const hospitals = useQuery({
    queryKey: ["hospital-names"],
    queryFn: async () => (await api.get<{ items: HospitalSummary[] }>("/hospitals", { anonymous: true, query: { limit: 50 } })).data.items.map((h) => ({ id: h.id, name: h.name })),
    staleTime: 300_000,
  });
  const list = useInfiniteQuery({
    queryKey: ["reviews", hospitalId, rating, verifiedVisit],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const res = await api.get<{ items: ReviewView[] }>("/reviews", { anonymous: true, query: { hospitalId: hospitalId || undefined, rating: rating || undefined, verifiedVisit: verifiedVisit || undefined, cursor: pageParam || undefined } });
      return { items: res.data.items, next: res.meta.nextCursor ?? null };
    },
    getNextPageParam: (l) => l.next ?? undefined,
  });
  const report = useMutation({ mutationFn: (id: string) => api.post(`/reviews/${id}/report`, { reason: reportReason }) });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const canWrite = status === "signedIn" && me?.role === "patient";

  return (
    <PageShell width="wide">
      <PageHeader title={t("title")} description={t("pageDescription")} />
      <div className="mb-6 rounded-card border-2 border-dashed border-border-strong p-3"><OpinionDisclaimer /></div>
      <div className="grid gap-6 lg:grid-cols-[1fr,380px]">
        <section aria-labelledby="rev-list" className="space-y-4">
          <h2 id="rev-list" className="sr-only">{t("listTitle")}</h2>
          <form className="grid gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()} aria-label={t("filters")}>
            <div>
              <label htmlFor="rf-h" className="font-medium">{t("hospital")}</label>
              <Select id="rf-h" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
                <option value="">{t("allHospitals")}</option>
                {hospitals.data?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="rf-r" className="font-medium">{t("rating")}</label>
              <Select id="rf-r" value={rating} onChange={(e) => setRating(e.target.value)}>
                <option value="">{t("anyRating")}</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{t("starOption", { count: n })}</option>)}
              </Select>
            </div>
            <Checkbox className="self-end" label={t("verifiedOnly")} checked={verifiedVisit} onChange={(e) => setVerifiedVisit(e.target.checked)} />
          </form>
          {list.isPending ? (
            <LoadingRegion label={t("loading")}><ResultCardSkeleton /></LoadingRegion>
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t("empty")} />
          ) : (
            <>
              <ul className="space-y-3">{items.map((r) => <li key={r.id}><ReviewCard review={r} onReport={setReportId} /></li>)}</ul>
              {list.hasNextPage ? <Button variant="outline" block loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t("loadMore")}</Button> : null}
            </>
          )}
        </section>
        <aside>
          <Card className="space-y-3">
            <h2 className="text-lg">{t("writeTitle")}</h2>
            {canWrite ? (
              <ReviewForm
                hospitals={hospitals.data ?? []}
                defaultHospitalId={hospitalId || undefined}
                submitted={submitted}
                onSubmit={async (v) => {
                  await api.post("/reviews", v);
                  setSubmitted(true);
                }}
              />
            ) : (
              <p>
                {t("signInToWrite")}{" "}
                <Link href="/login?next=/reviews" className="font-medium text-primary underline">{t("signIn")}</Link>
              </p>
            )}
          </Card>
        </aside>
      </div>
      <Dialog open={!!reportId} onOpenChange={(o) => (!o && (setReportId(null), report.reset()))}>
        <DialogContent title={t("reportTitle")}>
          {report.isSuccess ? (
            <StatusBanner variant="info" title={t("reported")} />
          ) : (
            <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), reportId && report.mutate(reportId))}>
              <label htmlFor="rep-r" className="font-medium">{t("reportReason")}</label>
              <Select id="rep-r" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                {(["abusive", "spam", "personal_info", "false_info", "other"] as const).map((x) => <option key={x} value={x}>{t(`reasons.${x}`)}</option>)}
              </Select>
              {report.isError ? <StatusBanner variant="error" title={msg(report.error)} /> : null}
              <Button type="submit" block loading={report.isPending}>{t("sendReport")}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense>
      <ReviewsView />
    </Suspense>
  );
}
