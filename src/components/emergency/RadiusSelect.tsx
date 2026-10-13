"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function RadiusSelect({ value, options, max, onChange }: { value: number; options: number[]; max: number; onChange: (v: number) => void }) {
  const t = useTranslations("emergency");
  const opts = options.filter((o) => o <= max);
  return (
    <fieldset>
      <legend className="font-medium">{t("radiusLabel")}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {opts.map((o) => (
          <label key={o} className={cn("flex min-h-touch cursor-pointer items-center rounded-control border-2 px-4 font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[var(--focus)]", value === o ? "border-primary bg-tint-primary text-primary-hover" : "border-border bg-surface")}>
            <input type="radio" name="radius" value={o} checked={value === o} onChange={() => onChange(o)} className="sr-only" />
            {t("km", { km: o })}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
