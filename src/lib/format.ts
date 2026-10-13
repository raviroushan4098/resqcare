import { TIME_ZONE, type Locale } from "./constants";

const intlLocale = (l: Locale) => (l === "hi" ? "hi-IN" : "en-IN");

export function formatNumber(n: number, locale: Locale, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(intlLocale(locale), opts).format(n);
}

/** "3.2 km" / "3.2 कि॰मी॰". Callers add the "estimate" label. */
export function formatDistanceKm(km: number, locale: Locale) {
  return formatNumber(km, locale, {
    style: "unit",
    unit: "kilometer",
    maximumFractionDigits: km < 10 ? 1 : 0,
  });
}

export function formatMinutes(min: number, locale: Locale) {
  return formatNumber(Math.max(1, Math.round(min)), locale, { style: "unit", unit: "minute", unitDisplay: "short" });
}

export function formatDateTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "2 hours ago". Anything under a minute reads "now". */
export function formatRelative(iso: string, locale: Locale, now: Date = new Date()) {
  const diffSec = (new Date(iso).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, sec] of UNITS) {
    if (Math.abs(diffSec) >= sec) return rtf.format(Math.round(diffSec / sec), unit);
  }
  return rtf.format(0, "second");
}

/** "+91 ••••• •3210". Shows only the last four digits. */
export function maskPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return `+91 ••••• •${digits.slice(-4)}`;
}

/** Pretty-prints an E.164 Indian number for display: "+91 98765 43210". */
export function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  const local = d.length > 10 ? d.slice(-10) : d;
  return local.length === 10 ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : phone;
}
