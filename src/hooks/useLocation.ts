"use client";

import { useCallback, useState } from "react";

export type LocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; lat: number; lng: number; accuracy: number }
  | { status: "denied"; reason: "denied" | "unavailable" | "timeout" | "unsupported" };

/** Wraps the Geolocation API. Never called until the user has read why and pressed "Use my location". */
export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: "idle" });
  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "denied", reason: "unsupported" });
      return;
    }
    setState({ status: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (p) => setState({ status: "granted", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => setState({ status: "denied", reason: e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  return { state, request, reset: () => setState({ status: "idle" }) };
}
