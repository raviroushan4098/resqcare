"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Ambulance, Flag, MapPinned, Phone } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AvailabilityMeter } from "@/components/hospitals/AvailabilityMeter";
import { FacilityList } from "@/components/hospitals/FacilityList";
import { LazyMap } from "@/components/maps/LazyMap";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageShell } from "@/components/shared/PageShell";
import { ProfileSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { OpinionDisclaimer } from "@/components/trust/OpinionDisclaimer";
import { ReviewCard } from "@/components/trust/ReviewCard";
import { StarRating } from "@/components/trust/StarRating";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { api, isApiError } from "@/lib/api";
import { HospitalDetailSchema, type HospitalDetail, type ReviewView } from "@/lib/schemas";

function ReportDialog({ hospitalId }: { hospitalId: string }) {
  const t = useTranslations("profile.report");
  const msg = useApiErrorMessage();
  const [field, setField] = useState("availability");
  const [desc, setDesc] = useState("");
  const send = useMutation({ mutationFn: () => api.post(`/hospitals/${hospitalId}/flags`, { field, description: desc }) });
  return (
    <Dialog onOpenChange={(o) => !o && send.reset()}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Flag aria-hidden="true" className="h-4 w-4" />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={t("description")}>
        {send.isSuccess ? (
          <StatusBanner variant="info" title={t("thanks")} />
        ) : (
          <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), desc.trim().length >= 5 && send.mutate())}>
            <Field label={t("field")}>
              {({ id }) => (
                <Select id={id} value={field} onChange={(e) => setField(e.target.value)}>
                  {(["availability", "facilities", "contact", "address", "hours", "other"] as const).map((f) => <option key={f} value={f}>{t(`fields.${f}`)}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t("details")} required hint={t("detailsHint")}>
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} />}
            </Field>
            {send.isError ? <StatusBanner variant="error" title={msg(send.error)} /> : null}
            <Button type="submit" block disabled={desc.trim().length < 5} loading={send.isPending}>{t("send")}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function HospitalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("profile");
  const a = useTranslations("availability");
  const cfg = usePublicConfig();
  const q = useQuery({
    queryKey: ["hospital", id],
    queryFn: async () => (await api.get<HospitalDetail>(`/hospitals/${id}`, { anonymous: true, schema: HospitalDetailSchema })).data,
  });
  const reviews = useQuery({
    queryKey: ["hospital-reviews", id],
    queryFn: async () => (await api.get<{ items: ReviewView[] }>(`/hospitals/${id}/reviews`, { anonymous: true })).data.items,
  });
  usePageTitle(q.data?.name ?? t("title"));

  if (isApiError(q.error) && q.error.code === "NOT_FOUND") notFound();

  return (
    <PageShell width="wide">
      {q.isPending ? (
        <div role="status" aria-live="polite"><span className="sr-only">{t("loading")}</span><ProfileSkeleton /></div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Profile h={q.data} reviews={reviews.data ?? []} windowMinutes={cfg.data?.freshness.availabilityMinutes} />
      )}
    </PageShell>
  );

  function Profile({ h, reviews, windowMinutes }: { h: HospitalDetail; reviews: ReviewView[]; windowMinutes?: number }) {
    const approved = h.verification === "approved";
    const av = h.availability;
    const windowLabel = windowMinutes ? t("windowMinutes", { minutes: windowMinutes }) : undefined;
    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <h1>{h.name}</h1>
          <VerifiedBadge state={h.verification} verifiedAt={h.verifiedAt} />
          <p className="text-muted">{h.address}</p>
          <p className="text-sm">{t("hours", { hours: h.operatingHours || "—" })} · {t("emergencyHours", { hours: h.emergencyHours || "—" })}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a href={`tel:${h.phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "positive", size: "lg" })} aria-label={t("callLabel", { name: h.name, phone: h.phone })}>
              <Phone aria-hidden="true" className="h-5 w-5" />
              {t("call")}
            </a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <MapPinned aria-hidden="true" className="h-5 w-5" />
              {t("directions")}
            </a>
            {approved ? (
              <Link href={`/ambulance?hospital=${h.id}`} className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <Ambulance aria-hidden="true" className="h-5 w-5" />
                {t("requestAmbulance")}
              </Link>
            ) : null}
          </div>
        </header>

        {!approved ? <StatusBanner variant="info" title={t("unverifiedTitle")} description={t("unverifiedBody")} /> : null}
        {approved && av.tier === "reported" ? <StatusBanner variant="stale" title={t("staleTitle")} description={t("staleBody")} /> : null}

        <section aria-labelledby="avail-title" className="space-y-3">
          <h2 id="avail-title">{t("availability")}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <AvailabilityMeter label={a("icu")} count={av.icuBeds} total={av.icuTotal} tier={av.tier} updatedAt={av.updatedAt} source={av.source} />
            <AvailabilityMeter label={a("emergency")} count={av.emergencyBeds} total={av.emergencyTotal} tier={av.tier} updatedAt={av.updatedAt} source={av.source} />
            <AvailabilityMeter label={a("ventilators")} count={av.ventilators} total={av.ventilatorsTotal} tier={av.tier} updatedAt={av.updatedAt} source={av.source} />
          </div>
        </section>

        <section aria-labelledby="fac-title" className="space-y-3">
          <h2 id="fac-title">{t("facilities")}</h2>
          <FacilityList facilities={h.facilities} windowLabel={windowLabel} />
        </section>

        {approved ? (
          <section aria-labelledby="dep-title" className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 id="dep-title" className="mb-2">{t("departments")}</h2>
              {h.departments.length ? <ul className="list-disc pl-5">{h.departments.map((d) => <li key={d.id}>{d.name}</li>)}</ul> : <p className="text-muted">{t("noneConfirmed")}</p>}
            </div>
            <div>
              <h2 className="mb-2">{t("specialists")}</h2>
              {h.specialists.length ? (
                <ul className="space-y-1">{h.specialists.map((s) => <li key={s.id}>{s.name} · {s.specialty}{s.onDuty ? ` · ${t("onDuty")}` : ""}</li>)}</ul>
              ) : <p className="text-muted">{t("noneConfirmed")}</p>}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="map-title" className="space-y-2">
          <h2 id="map-title">{t("map")}</h2>
          <LazyMap center={{ lat: h.lat, lng: h.lng }} zoom={14} markers={[{ id: h.id, lat: h.lat, lng: h.lng, title: h.name, kind: approved ? "verified" : "unverified" }]} label={t("mapLabel", { name: h.name })} />
          <p className="text-sm text-muted">{t("mapNote")}</p>
        </section>

        <section aria-labelledby="rev-title" className="space-y-3 rounded-card border-2 border-dashed border-border-strong p-4">
          <h2 id="rev-title">{t("reviewsTitle")}</h2>
          <OpinionDisclaimer />
          {h.ratingSummary.count ? (
            <p className="flex items-center gap-2"><StarRating value={h.ratingSummary.average ?? 0} size="sm" /> {t("ratingSummary", { avg: h.ratingSummary.average ?? 0, count: h.ratingSummary.count })}</p>
          ) : <p className="text-muted">{t("noReviews")}</p>}
          <ul className="space-y-2">{reviews.slice(0, 3).map((r) => <li key={r.id}><ReviewCard review={r} showHospital={false} /></li>)}</ul>
          <Link href={`/reviews?hospitalId=${h.id}`} className="inline-flex min-h-touch items-center font-medium text-primary underline">{t("allReviews")}</Link>
        </section>

        <ReportDialog hospitalId={h.id} />
      </div>
    );
  }
}
