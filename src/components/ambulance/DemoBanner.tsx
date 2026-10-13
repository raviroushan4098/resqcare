"use client";

import { useTranslations } from "next-intl";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { usePublicConfig } from "@/hooks/usePublicConfig";

/**
 * Persistent, non-dismissible strip on every ambulance screen when demo mode
 * is on. Pass `demo` from a booking to override the global flag.
 */
export function DemoBanner({ demo }: { demo?: boolean }) {
  const t = useTranslations("demo");
  const cfg = usePublicConfig();
  const on = demo ?? cfg.data?.demoMode ?? false;
  if (!on) return null;
  return <StatusBanner variant="demo" title={t("title")} description={t("body")} className="mb-4" />;
}
