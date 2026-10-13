"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Read-only display, or a keyboard-operable radio group (arrow keys move between stars). */
export function StarRating({
  value,
  onChange,
  label,
  size = "md",
  error,
}: {
  value: number;
  onChange?: (v: number) => void;
  label?: string;
  size?: "sm" | "md";
  error?: string;
}) {
  const t = useTranslations("reviews");
  const name = useId();
  const cls = size === "sm" ? "h-4 w-4" : "h-8 w-8";
  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" role="img" aria-label={t("starsLabel", { value: Math.round(value * 10) / 10 })}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} aria-hidden="true" className={cn(cls, i <= Math.round(value) ? "fill-[#b26a00] text-[#b26a00]" : "text-border-strong")} />
        ))}
      </span>
    );
  }
  return (
    <fieldset aria-describedby={error ? `${name}-err` : undefined}>
      <legend className="font-medium">{label ?? t("ratingLabel")}</legend>
      <div className="mt-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className="cursor-pointer rounded-control p-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[var(--focus)]">
            <input type="radio" name={name} value={i} checked={value === i} onChange={() => onChange(i)} className="sr-only" />
            <Star aria-hidden="true" className={cn("h-10 w-10", i <= value ? "fill-[#b26a00] text-[#b26a00]" : "text-border-strong")} />
            <span className="sr-only">{t("starOption", { count: i })}</span>
          </label>
        ))}
      </div>
      {error ? <p id={`${name}-err`} className="mt-1 text-sm font-medium text-emergency">{error}</p> : null}
    </fieldset>
  );
}
