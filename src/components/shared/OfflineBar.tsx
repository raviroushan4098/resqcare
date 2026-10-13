"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useOnline } from "@/hooks/useOnline";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getLastSync, subscribeSync } from "@/lib/sync";

export function OfflineBar() {
  const online = useOnline();
  const t = useTranslations("offline");
  const locale = useAppLocale();
  const lastSync = useSyncExternalStore(subscribeSync, getLastSync, () => null);

  // The live region stays mounted so screen readers announce the change.
  return (
    <div role="status">
      {online ? null : (
    <div className="border-b border-reported bg-tint-reported px-4 py-2 text-text">
      <div className="mx-auto flex max-w-screen-xl items-start gap-2">
        <WifiOff aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-reported-text" />
        <p className="text-sm">
          <strong className="font-semibold">{t("title")}</strong>{" "}
          {lastSync ? (
            <time dateTime={lastSync} title={formatDateTime(lastSync, locale)}>
              {t("lastSync", { time: formatRelative(lastSync, locale) })}
            </time>
          ) : (
            <span>{t("neverSynced")}</span>
          )}
        </p>
      </div>
    </div>
      )}
    </div>
  );
}
