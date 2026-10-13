export const DEFAULT_WEIGHTS = {
  travel: 0.3,
  availability: 0.2,
  freshness: 0.15,
  distance: 0.15,
  specialist: 0.15,
  rating: 0.05,
} as const;

export const DEFAULT_FRESHNESS = { availabilityMinutes: 60, facilityDays: 90 } as const;
export const DEFAULT_SEARCH = { defaultRadiusKm: 10, maxRadiusKm: 25 } as const;
export const DEFAULT_DEMO = { simulateDispatch: true, acceptDelaySec: 8, stepDelaySec: 6 } as const;

export const TIMEOUTS = { geminiMs: 3000, routesMs: 2500 } as const;
export const CACHE_TTL = { routesMs: 5 * 60_000, hospitalStaticMs: 60_000 } as const;

export const SEARCHING_TIMEOUT_MS = 3 * 60_000;
export const SHARE_LINK_TTL_MS = 2 * 60 * 60_000;
export const LOCATION_THROTTLE_MS = 5_000;
export const LOCATION_FRESH_MS = 30_000;
export const LOCATION_TTL_AFTER_TRIP_MS = 24 * 60 * 60_000;
export const EMERGENCY_REQUEST_TTL_MS = 30 * 24 * 60 * 60_000;
export const IDEMPOTENCY_TTL_MS = 48 * 60 * 60_000;
export const SEARCH_LOG_TTL_MS = 30 * 24 * 60 * 60_000;
export const REVIEW_COOLDOWN_MS = 30 * 24 * 60 * 60_000;

/** Average urban ambulance speed used for straight-line ETA estimates. */
export const FALLBACK_SPEED_KMH = 28;
/** Straight-line distance times this approximates road distance. */
export const ROAD_FACTOR = 1.35;
