import { distanceBetween, geohashForLocation, geohashQueryBounds } from "geofire-common";

export const geohash = (lat: number, lng: number) => geohashForLocation([lat, lng], 9);

/** Great-circle distance in km. */
export const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  distanceBetween([a.lat, a.lng], [b.lat, b.lng]);

export const queryBounds = (lat: number, lng: number, radiusKm: number) => geohashQueryBounds([lat, lng], radiusKm * 1000);

/** Rounds to ~1.1 km so stored request locations are not exact. */
export const roundLocation = (lat: number, lng: number) => ({
  lat: Math.round(lat * 100) / 100,
  lng: Math.round(lng * 100) / 100,
});

/** Point a fraction of the way from a to b. */
export const interpolate = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, t: number) => ({
  lat: a.lat + (b.lat - a.lat) * t,
  lng: a.lng + (b.lng - a.lng) * t,
});
