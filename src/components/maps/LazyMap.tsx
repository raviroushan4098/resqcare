"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { StatusBanner } from "@/components/shared/StatusBanner";
import type MapCanvasType from "./MapCanvas";

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className="h-[360px] w-full animate-pulse rounded-card bg-[#e3eaf2] md:h-[520px]" />,
});

export const mapsKey = () => process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

/**
 * Renders the Google map only when a key exists and maps are not degraded;
 * otherwise a notice. Callers always render a list equivalent alongside.
 */
export function LazyMap(props: Omit<ComponentProps<typeof MapCanvasType>, "apiKey" | "onError"> & { degraded?: boolean }) {
  const t = useTranslations("maps");
  const [failed, setFailed] = useState(false);
  const key = mapsKey();
  if (!key || props.degraded || failed) {
    return <StatusBanner variant="degraded-maps" title={t("unavailableTitle")} description={t("unavailableBody")} />;
  }
  return <MapCanvas {...props} apiKey={key} onError={() => setFailed(true)} />;
}
