"use client";

import { useEffect, useState } from "react";
import { useAppLocale } from "@/hooks/useAppLocale";
import { formatDateTime, formatRelative } from "@/lib/format";

/** "2 hours ago" with the full timestamp in title and <time datetime>. Re-renders every minute. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const locale = useAppLocale();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={iso} title={formatDateTime(iso, locale)} className={className} suppressHydrationWarning>
      {formatRelative(iso, locale, now)}
    </time>
  );
}
