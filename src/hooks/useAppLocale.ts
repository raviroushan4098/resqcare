import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/constants";

/** The active locale, narrowed to the app's supported locales. */
export function useAppLocale(): Locale {
  const l = useLocale();
  return isLocale(l) ? l : DEFAULT_LOCALE;
}
