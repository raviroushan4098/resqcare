"use client";

import { useTranslations } from "next-intl";
import { Field, Textarea } from "@/components/ui/field";
import { LIMITS } from "@/lib/constants";

export function SymptomTextField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("emergency");
  return (
    <Field label={t("symptomsLabel")} hint={t("symptomsHint")}>
      {({ id, describedBy }) => (
        <>
          <Textarea id={id} aria-describedby={describedBy} value={value} maxLength={LIMITS.symptomsMax} rows={3} onChange={(e) => onChange(e.target.value)} />
          <p className="text-right text-sm text-muted">{t("counter", { count: value.length, max: LIMITS.symptomsMax })}</p>
        </>
      )}
    </Field>
  );
}
