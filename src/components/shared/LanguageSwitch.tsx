"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useAppLocale } from "@/hooks/useAppLocale";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * English / Hindi toggle. Writes the locale cookie, updates <html lang>, and
 * refreshes server components in place (no full page reload).
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations("language");
  const current = useAppLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === current) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    startTransition(() => router.refresh());
  }

  return (
    <div role="group" aria-label={t("label")} aria-busy={pending} className={cn("flex rounded-control border border-border-strong p-0.5", className)}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={current === l}
          onClick={() => choose(l)}
          className={cn(
            "min-h-touch min-w-touch rounded-[10px] px-3 text-sm font-medium",
            current === l ? "bg-text text-white" : "text-text hover:bg-bg",
          )}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
