"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MapPinned, Navigation, Phone, Radio, RadioTower } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { DemoBanner } from "@/components/ambulance/DemoBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageShell } from "@/components/shared/PageShell";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { ProfileSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useOnline } from "@/hooks/useOnline";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, isApiError } from "@/lib/api";
import type { AmbulanceType, BookingStatus } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Assignment = {
  bookingId: string; status: BookingStatus; demo: boolean; type: AmbulanceType; patientCount: number;
  pickup: { lat: number; lng: number; address: string | null };
  destination: { name: string; lat: number; lng: number; phone: string } | null;
  contact: { firstName: string; phone: string; phoneMasked: string };
  note: string | null; vehicle: { registration: string; type: AmbulanceType } | null;
  nextStep: "EnRoute" | "Arrived" | "Completed" | null; locationSharingAllowed: boolean;
};
type Point = { lat: number; lng: number; accuracy?: number; ts: string };
const BUFFER_KEY = "rq-driver-points";

const readBuffer = (): { bookingId: string; points: Point[] } | null => {
  try {
    const r = window.localStorage.getItem(BUFFER_KEY);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
};
const writeBuffer = (v: { bookingId: string; points: Point[] } | null) => {
  try {
    if (v && v.points.length) window.localStorage.setItem(BUFFER_KEY, JSON.stringify({ ...v, points: v.points.slice(-60) }));
    else window.localStorage.removeItem(BUFFER_KEY);
  } catch {
    /* best effort */
  }
};

/** Location sharing: one fix every 5 s while allowed; buffered offline and flushed later. Stops itself when the trip ends. */
function useLocationSharing(bookingId: string | null, allowed: boolean) {
  const [active, setActive] = useState(false);
  const [denied, setDenied] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [buffered, setBuffered] = useState(0);
  const watch = useRef<number | null>(null);
  const lastFix = useRef(0);
  const online = useOnline();

  const flush = useCallback(async () => {
    const buf = readBuffer();
    if (!buf || !buf.points.length) return;
    try {
      const res = await api.post<{ accepted: number; sharing: boolean }>("/driver/location", buf);
      writeBuffer(null);
      setBuffered(0);
      setLastSent(new Date().toISOString());
      if (!res.data.sharing) setActive(false);
    } catch (e) {
      if (!isApiError(e) || e.code !== "NETWORK_ERROR") writeBuffer(null);
    }
  }, []);

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setActive(false);
  }, []);

  const start = useCallback(() => {
    if (!bookingId || !navigator.geolocation) return setDenied(true);
    setDenied(false);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - lastFix.current < 5000) return;
        lastFix.current = Date.now();
        const buf = readBuffer();
        const points = [...(buf?.bookingId === bookingId ? buf.points : []), { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, ts: new Date().toISOString() }];
        writeBuffer({ bookingId, points });
        setBuffered(points.length);
        void flush();
      },
      () => {
        setDenied(true);
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    setActive(true);
  }, [bookingId, flush, stop]);

  useEffect(() => {
    if (!allowed && active) stop();
  }, [allowed, active, stop]);
  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);
  useEffect(() => stop, [stop]);
  return { active, denied, lastSent, buffered, start, stop };
}

function Driver() {
  const t = useTranslations("driver");
  const ty = useTranslations("ambulanceTypes");
  const st = useTranslations("booking.status");
  usePageTitle(t("title"));
  const qc = useQueryClient();
  const msg = useApiErrorMessage();
  const q = useApiQuery<{ assignment: Assignment | null; history: { bookingId: string; status: BookingStatus; completedAt: string; type: AmbulanceType }[] }>(["driver-assignment"], "/driver/assignment", { refetchInterval: 5000 });
  const a = q.data?.assignment ?? null;
  const share = useLocationSharing(a?.bookingId ?? null, !!a?.locationSharingAllowed);
  const advance = useMutation({
    mutationFn: (status: "EnRoute" | "Arrived" | "Completed") => api.post(`/driver/bookings/${a!.bookingId}/status`, { status }),
    onSuccess: (_d, status) => {
      if (status !== "EnRoute") share.stop();
      void qc.invalidateQueries({ queryKey: ["driver-assignment"] });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ["driver-assignment"] }),
  });

  if (q.isPending) return <ProfileSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <DemoBanner demo={a?.demo} />
      <h1>{t("title")}</h1>
      {!a ? (
        <EmptyState title={t("noAssignment")} description={t("noAssignmentBody")} />
      ) : (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xl font-bold">{st(a.status)}</p>
            <p className="text-sm text-muted">{a.vehicle?.registration} · {ty(a.type)}</p>
          </div>
          <dl className="space-y-2 text-lg">
            <div><dt className="text-sm text-muted">{t("pickup")}</dt><dd className="font-semibold">{a.pickup.address ?? `${a.pickup.lat.toFixed(4)}, ${a.pickup.lng.toFixed(4)}`}</dd></div>
            <div><dt className="text-sm text-muted">{t("destination")}</dt><dd className="font-semibold">{a.destination?.name ?? "—"}</dd></div>
            <div><dt className="text-sm text-muted">{t("contact")}</dt><dd className="font-semibold">{a.contact.firstName} · {t("patients", { count: a.patientCount })}</dd></div>
            {a.note ? <div><dt className="text-sm text-muted">{t("note")}</dt><dd>{a.note}</dd></div> : null}
          </dl>
          <div className="grid gap-2 sm:grid-cols-2">
            <a className={buttonVariants({ variant: "outline", size: "xl" })} target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${a.status === "EnRoute" || a.status === "Assigned" ? `${a.pickup.lat},${a.pickup.lng}` : `${a.destination?.lat},${a.destination?.lng}`}`}>
              <MapPinned aria-hidden="true" className="h-6 w-6" />
              {t("openMaps")}
            </a>
            <a className={buttonVariants({ variant: "positive", size: "xl" })} href={`tel:${a.contact.phone}`} aria-label={t("callContact", { name: a.contact.firstName })}>
              <Phone aria-hidden="true" className="h-6 w-6" />
              {t("call")}
            </a>
          </div>
          {a.nextStep ? (
            <Button size="xl" block className="min-h-[72px] text-2xl" loading={advance.isPending} onClick={() => advance.mutate(a.nextStep!)}>
              {a.nextStep === "EnRoute" ? <Navigation aria-hidden="true" className="h-7 w-7" /> : <CheckCircle2 aria-hidden="true" className="h-7 w-7" />}
              {t(`step.${a.nextStep}`)}
            </Button>
          ) : null}
          {advance.isError ? <StatusBanner variant="error" title={isApiError(advance.error) && advance.error.code === "CONFLICT" ? t("invalidTransition") : msg(advance.error)} /> : null}

          <div className={cn("space-y-2 rounded-control border-2 p-3", share.active ? "border-confirmed bg-tint-confirmed" : "border-border")}>
            <p className="flex items-center gap-2 text-lg font-semibold" role="status">
              {share.active ? <RadioTower aria-hidden="true" className="h-6 w-6 text-confirmed motion-safe:animate-pulse" /> : <Radio aria-hidden="true" className="h-6 w-6 text-muted" />}
              {share.active ? t("sharingOn") : t("sharingOff")}
            </p>
            {share.lastSent ? <p className="text-sm">{t("lastSent")} <RelativeTime iso={share.lastSent} /></p> : null}
            {share.buffered > 0 ? <p className="text-sm font-medium text-reported-text">{t("buffered", { count: share.buffered })}</p> : null}
            {share.denied ? <p className="text-sm font-medium text-emergency">{t("locationDenied")}</p> : null}
            {a.locationSharingAllowed ? (
              <Button size="xl" block variant={share.active ? "danger" : "positive"} onClick={() => (share.active ? share.stop() : share.start())}>
                {share.active ? t("stopSharing") : t("startSharing")}
              </Button>
            ) : <p className="text-sm text-muted">{t("sharingNotAllowed")}</p>}
          </div>
        </Card>
      )}
      <section aria-labelledby="hist">
        <h2 id="hist" className="mb-2 text-lg">{t("history")}</h2>
        {q.data.history.length ? (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {q.data.history.map((h) => <li key={h.bookingId} className="flex justify-between p-3"><span>{st(h.status)} · {ty(h.type)}</span><RelativeTime iso={h.completedAt} className="text-muted" /></li>)}
          </ul>
        ) : <p className="text-muted">{t("noHistory")}</p>}
      </section>
    </div>
  );
}

export default function DriverDashboardPage() {
  return (
    <PageShell audience="portal">
      <ProtectedRoute roles={["driver"]}>
        <Driver />
      </ProtectedRoute>
    </PageShell>
  );
}
