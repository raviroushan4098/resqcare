"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { AUTH_MODE } from "@/lib/constants";
import type { BookingView } from "@/lib/schemas";
import { TERMINAL_STATUSES } from "@/lib/schemas";

/**
 * Live booking status. With Firebase auth the Firestore booking document is
 * watched with onSnapshot (rules restrict it to authorised viewers) and each
 * change refetches the filtered view from the API. Otherwise it polls every
 * 2 s, which meets the "within 3 seconds" target.
 */
export function useBookingStatus(id: string, shareToken?: string | null, enabled = true) {
  const qc = useQueryClient();
  const key = ["booking", id, shareToken ?? null];
  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => (await api.get<BookingView>(`/bookings/${id}`, { query: { t: shareToken ?? undefined } })).data,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s && TERMINAL_STATUSES.includes(s)) return false;
      return AUTH_MODE === "firebase" && !shareToken ? 15_000 : 2_000;
    },
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (AUTH_MODE !== "firebase" || shareToken || !enabled) return;
    let unsub = () => {};
    void (async () => {
      const [{ firestore }, { doc, onSnapshot }] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
      unsub = onSnapshot(
        doc(firestore(), "ambulanceBookings", id),
        () => void qc.invalidateQueries({ queryKey: key }),
        () => {
          /* permission or network issue: polling continues */
        },
      );
    })();
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, shareToken, enabled]);

  return query;
}
