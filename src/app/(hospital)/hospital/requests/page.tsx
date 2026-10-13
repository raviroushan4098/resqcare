"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RequestCard, type IncomingRequest } from "@/components/portal/RequestCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/useApiQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AUTH_MODE } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Resp = { items: IncomingRequest[]; canViewContact: boolean; canRespond: boolean };
const FILTERS = ["open", "accepted", "declined", "arrived", ""] as const;

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch {
    /* audio may be blocked until the user interacts */
  }
}

export default function RequestsPage() {
  const t = useTranslations("portal.requests");
  usePageTitle(t("title"));
  const qc = useQueryClient();
  const toast = useToast();
  const msg = useApiErrorMessage();
  const { me } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [muted, setMuted] = useState(true);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = ["hospital-requests", filter];
  const q = useApiQuery<Resp>(key, "/hospital/requests", { query: { status: filter || undefined }, refetchInterval: 4000 });

  // Firestore mode: a snapshot on this hospital's requests triggers an immediate refetch.
  useEffect(() => {
    if (AUTH_MODE !== "firebase" || !me?.hospitalId) return;
    let unsub = () => {};
    void (async () => {
      const [{ firestore }, fs] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
      unsub = fs.onSnapshot(fs.query(fs.collection(firestore(), "emergencyRequests"), fs.where("hospitalId", "==", me.hospitalId)), () => void qc.invalidateQueries({ queryKey: ["hospital-requests"] }), () => {});
    })();
    return () => unsub();
  }, [me?.hospitalId, qc]);

  useEffect(() => {
    if (!q.data) return;
    const ids = q.data.items.filter((i) => i.status === "new").map((i) => i.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    if (added.length) {
      added.forEach((id) => seen.current!.add(id));
      setFresh((f) => new Set([...f, ...added]));
      if (!muted) beep();
    }
  }, [q.data, muted]);

  async function respond(id: string, action: "accept" | "decline" | "arrived", reason?: string) {
    const prev = qc.getQueryData<Resp>(key);
    // Optimistic update, rolled back on conflict or error.
    qc.setQueryData<Resp>(key, (d) => d && { ...d, items: d.items.map((i) => (i.id === id ? { ...i, status: action === "accept" ? "accepted" : action === "decline" ? "declined" : "arrived", handledByName: me?.displayName ?? null } : i)) });
    try {
      await api.post(`/hospital/requests/${id}/respond`, { action, reason });
      setFresh((f) => new Set([...f].filter((x) => x !== id)));
    } catch (e) {
      qc.setQueryData(key, prev);
      toast({ title: isApiError(e) && e.code === "CONFLICT" ? t("conflict") : msg(e), tone: "error" });
    } finally {
      void qc.invalidateQueries({ queryKey: ["hospital-requests"] });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button variant="outline" aria-pressed={!muted} onClick={() => setMuted((m) => !m)}>
            {muted ? <BellOff aria-hidden="true" className="h-4 w-4" /> : <Bell aria-hidden="true" className="h-4 w-4" />}
            {muted ? t("soundOff") : t("soundOn")}
          </Button>
        }
      />
      <div role="group" aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f || "all"} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("min-h-touch rounded-control border px-3", filter === f ? "border-text bg-text text-white" : "border-border-strong bg-surface")}>
            {t(`filters.${f || "all"}` as "filters.open")}
          </button>
        ))}
      </div>
      {q.isError && q.data ? <StatusBanner variant="offline" title={t("reconnecting")} action={<WifiOff aria-hidden="true" className="h-5 w-5" />} /> : null}
      {q.data && !q.data.canViewContact ? <p className="text-sm text-muted">{t("contactPermission")}</p> : null}
      <p aria-live="polite" className="sr-only">{q.data ? t("count", { count: q.data.items.length }) : ""}</p>
      {q.isPending ? (
        <TableSkeleton rows={3} />
      ) : q.isError && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyBody")} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {q.data.items.map((r) => (
            <li key={r.id}>
              <RequestCard req={r} isNew={fresh.has(r.id)} canRespond={q.data!.canRespond} onRespond={(a, reason) => respond(r.id, a, reason)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
