/**
 * Indian emergency numbers. Hard-coded on purpose: the emergency bar must
 * work with no API, config or JavaScript data loaded.
 */
export const EMERGENCY_NUMBERS = {
  national: "112",
  ambulance: "108",
  ambulanceAlt: "102",
} as const;

export const LIMITS = {
  symptomsMax: 500,
  bookingNoteMax: 200,
  reviewMin: 20,
  reviewMax: 1000,
  compareMax: 3,
  driverLocationStaleMs: 30_000,
} as const;

export const DEFAULT_RADIUS_OPTIONS_KM = [5, 10, 15, 25] as const;

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export const TIME_ZONE = "Asia/Kolkata";

export const AUTH_MODE: "demo" | "firebase" = process.env.NEXT_PUBLIC_AUTH_MODE === "firebase" ? "firebase" : "demo";
