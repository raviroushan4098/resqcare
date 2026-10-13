import { FALLBACK_SPEED_KMH, ROAD_FACTOR } from "../../config/constants";
import { haversineKm } from "../../domain/geo";

/** Straight-line based estimate. Always labelled as an estimate in the UI. */
export function straightLineEstimate(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const km = haversineKm(a, b) * ROAD_FACTOR;
  return { distanceKm: Math.round(km * 10) / 10, etaMinutes: Math.max(2, Math.round((km / FALLBACK_SPEED_KMH) * 60)) };
}
