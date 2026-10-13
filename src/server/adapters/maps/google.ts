import "server-only";
import { TIMEOUTS } from "../../config/constants";
import { env } from "../../config/env";

/** Google Routes API, one call per destination (callers limit this to the top 5). */
export async function routeEstimate(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
  const key = env().GOOGLE_ROUTES_API_KEY;
  if (!key) throw new Error("not_configured");
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUTS.routesMs),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    }),
  });
  if (!res.ok) throw new Error(`routes_${res.status}`);
  const body = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
  const r = body.routes?.[0];
  if (!r?.duration || r.distanceMeters === undefined) throw new Error("no_route");
  return { distanceKm: Math.round(r.distanceMeters / 100) / 10, etaMinutes: Math.max(1, Math.round(parseInt(r.duration, 10) / 60)) };
}
