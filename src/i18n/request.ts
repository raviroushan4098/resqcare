import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, TIME_ZONE, isLocale } from "@/lib/constants";

// No locale URL prefix: the locale lives in a cookie set by LanguageSwitch.
export default getRequestConfig(async () => {
  const fromCookie = cookies().get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: TIME_ZONE,
  };
});
