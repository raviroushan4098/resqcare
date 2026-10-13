"use client";

import { useMutation } from "@tanstack/react-query";
import { Building2, Copy, Phone, RotateCcw, Share2 } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { BookingTimeline } from "@/components/ambulance/BookingTimeline";
import { DemoBanner } from "@/components/ambulance/DemoBanner";
import { DriverCard } from "@/components/ambulance/DriverCard";
import { LiveMap } from "@/components/ambulance/LiveMap";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageShell } from "@/components/shared/PageShell";
import { PermissionDenied } from "@/components/shared/ProtectedRoute";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { ProfileSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBookingStatus } from "@/hooks/useBookingStatus";
import { useOnline } from "@/hooks/useOnline";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { BookingView } from "@/lib/schemas";

const FAILED = ["Rejected", "TimedOut", "Failed"];
/** System notes arrive as codes and are translated; free-text reasons from staff show as written. */
const NOTE_CODES = ["demo_simulated_accept", "searching_timeout"] as const;

function Countdown({ until }: { until: string }) {
  const t = useTranslations("booking");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const s = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  return <p className="text-sm text-muted">{t("timeout", { m: Math.floor(s / 60), s: String(s % 60).padStart(2, "0") })}</p>;
}

function BookingStatusView() {
  const { id } = useParams<{ id: string }>();
  const share = useSearchParams().get("t");
  const t = useTranslations("booking");
  const ts = useTranslations("booking.status");
  usePageTitle(t("title"));
  const msg = useApiErrorMessage();
  const online = useOnline();
  const { status: authStatus } = useAuth();
  const q = useBookingStatus(id, share, authStatus !== "loading");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const shareLink = useMutation({
    mutationFn: async () => (await api.post<{ url: string; expiresAt: string }>(`/bookings/${id}/share-link`)).data,
    onSuccess: setLink,
  });
  const b = q.data;

  if (isApiError(q.error) && (q.error.code === "FORBIDDEN" || q.error.code === "UNAUTHENTICATED") && !b) {
    return (
      <PageShell audience="patient">
        <PermissionDenied />
      </PageShell>
    );
  }

  return (
    <PageShell audience="patient">
      <DemoBanner demo={b?.demo} />
      {!online && b ? <StatusBanner variant="offline" title={t("offlineTitle")} description={t("offlineBody", { status: ts(b.status) })} className="mb-4" /> : null}
      {q.isPending || authStatus === "loading" ? (
        <div role="status" aria-live="polite"><span className="sr-only">{t("loading")}</span><ProfileSkeleton /></div>
      ) : !b ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-6">
          <header className="space-y-1">
            <h1>{b.status === "Requested" || b.status === "Searching" ? t("headingRequested") : t("heading", { status: ts(b.status) })}</h1>
            <p className="text-sm text-muted">{t("requestedAt")} <RelativeTime iso={b.createdAt} /></p>
            {b.status === "Searching" && b.searchingTimeoutAt ? <Countdown until={b.searchingTimeoutAt} /> : null}
            {b.status === "Requested" || b.status === "Searching" ? <p>{t("notConfirmedYet")}</p> : null}
          </header>

          <div className="grid gap-6 md:grid-cols-[minmax(0,320px),1fr]">
            <Card>
              <h2 className="mb-3 text-lg">{t("progress")}</h2>
              <BookingTimeline status={b.status} events={b.events} />
            </Card>
            <div className="space-y-4">
              {FAILED.includes(b.status) ? (
                <section role="alert" className="space-y-3 rounded-card border-2 border-emergency bg-tint-emergency p-4">
                  <h2>{t(`failure.${b.status}` as "failure.Failed")}</h2>
                  <p>{t("failureBody")}</p>
                  <InlineEmergencyNumbers />
                  {b.isOwner ? (
                    <Link href={b.destination ? `/ambulance?hospital=${b.destination.hospitalId}` : "/ambulance"} className={buttonVariants({ variant: "primary", size: "lg" })}>
                      <RotateCcw aria-hidden="true" className="h-5 w-5" />
                      {t("tryAnother")}
                    </Link>
                  ) : null}
                </section>
              ) : null}
              {b.status === "Completed" ? <StatusBanner variant="info" title={t("completedTitle")} description={t("completedBody")} /> : null}
              <DriverCard booking={b} />
              <LiveMap status={b.status} location={b.lastLocation} pickup={b.pickup} etaMinutes={b.etaMinutes} />
              <Card className="space-y-3">
                <h2 className="text-lg">{t("actions")}</h2>
                <div className="flex flex-wrap gap-2">
                  {b.provider ? (
                    <a href={`tel:${b.provider.phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "positive" })}>
                      <Phone aria-hidden="true" className="h-4 w-4" />
                      {t("callProvider")}
                    </a>
                  ) : null}
                  {b.destination ? (
                    <a href={`tel:${b.destination.phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "outline" })}>
                      <Building2 aria-hidden="true" className="h-4 w-4" />
                      {t("callHospital", { name: b.destination.name })}
                    </a>
                  ) : null}
                  {b.isOwner && !["Completed", "Cancelled", "Rejected", "TimedOut", "Failed"].includes(b.status) ? (
                    <Button variant="outline" onClick={() => shareLink.mutate()} loading={shareLink.isPending}>
                      <Share2 aria-hidden="true" className="h-4 w-4" />
                      {t("share")}
                    </Button>
                  ) : null}
                  {b.canCancel ? (
                    <ConfirmDialog
                      trigger={<Button variant="danger">{t("cancel")}</Button>}
                      title={t("cancelTitle")}
                      description={t("cancelBody")}
                      confirmLabel={t("cancelConfirm")}
                      destructive
                      onConfirm={async () => {
                        await api.post(`/bookings/${id}/cancel`, {});
                        await q.refetch();
                      }}
                    />
                  ) : null}
                </div>
                {link ? (
                  <div className="space-y-1 rounded-control bg-bg p-3 text-sm">
                    <p>{t("shareReady")} <RelativeTime iso={link.expiresAt} /></p>
                    <div className="flex gap-2">
                      <label htmlFor="share-url" className="sr-only">{t("shareUrl")}</label>
                      <input id="share-url" readOnly value={link.url} className="min-h-touch flex-1 rounded-control border border-border-strong px-2" />
                      <Button variant="outline" size="icon" aria-label={t("copy")} onClick={() => void navigator.clipboard?.writeText(link.url)}>
                        <Copy aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : null}
                {shareLink.isError ? <StatusBanner variant="error" title={msg(shareLink.error)} /> : null}
              </Card>
              <Card>
                <h2 className="mb-2 text-lg">{t("history")}</h2>
                <ol className="space-y-1 text-sm">
                  {b.events.map((e, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-border py-1 last:border-0">
                      <span>{ts(e.state)} · {t(`by.${e.byRole === "system" ? "system" : e.byRole}` as "by.system")}{e.note ? ` · ${(NOTE_CODES as readonly string[]).includes(e.note) ? t(`notes.${e.note as (typeof NOTE_CODES)[number]}`) : e.note}` : ""}</span>
                      <RelativeTime iso={e.at} className="text-muted" />
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default function BookingPage() {
  return (
    <Suspense>
      <BookingStatusView />
    </Suspense>
  );
}

