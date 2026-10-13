import type { Tier } from "@/lib/schemas";

/**
 * Confidence tiers (Part A.3).
 *  - confirmed: verified fact within its freshness window
 *  - reported:  claimed by the hospital, or verified but older than the window ("call to confirm")
 *  - unknown:   no information
 */
export function facilityTier(
  f: { present: boolean; confirmed: boolean; lastVerifiedAt: string | null } | undefined,
  facilityDays: number,
  now: Date,
): Tier | null {
  if (!f) return "unknown";
  if (!f.present) return null; // hospital says it does not have it
  if (f.confirmed && f.lastVerifiedAt && ageMs(f.lastVerifiedAt, now) <= facilityDays * 86_400_000) return "confirmed";
  if (f.confirmed || f.lastVerifiedAt) return "reported";
  return "unknown";
}

export function availabilityTier(reportedAt: string | null, availabilityMinutes: number, now: Date): Tier {
  if (!reportedAt) return "unknown";
  return ageMs(reportedAt, now) <= availabilityMinutes * 60_000 ? "confirmed" : "reported";
}

export function ageMs(iso: string, now: Date) {
  return now.getTime() - new Date(iso).getTime();
}

/** 1 when fresh, falling linearly to 0 at three times the window. */
export function freshnessScore(reportedAt: string | null, availabilityMinutes: number, now: Date) {
  if (!reportedAt) return 0;
  const ratio = ageMs(reportedAt, now) / (availabilityMinutes * 60_000);
  return ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1) / 2);
}
