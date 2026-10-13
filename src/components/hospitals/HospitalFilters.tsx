"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/field";
import type { Tier } from "@/lib/schemas";

export type HospitalFilterValues = { q: string; specialty: string; emergency24x7: boolean; verifiedOnly: boolean; confidence: "" | Tier };
export const EMPTY_FILTERS: HospitalFilterValues = { q: "", specialty: "", emergency24x7: false, verifiedOnly: false, confidence: "" };
const SPECIALTIES = ["Cardiology", "Neurology", "Orthopaedics", "Pulmonology", "General Surgery", "Paediatrics", "Nephrology", "Obstetrics"];

export function HospitalFilters({ value, onChange }: { value: HospitalFilterValues; onChange: (v: HospitalFilterValues) => void }) {
  const t = useTranslations("hospitals.filters");
  const conf = useTranslations("confidence");
  const set = <K extends keyof HospitalFilterValues>(k: K, v: HospitalFilterValues[K]) => onChange({ ...value, [k]: v });
  return (
    <form role="search" aria-label={t("label")} className="space-y-3 rounded-card border border-border bg-surface p-4" onSubmit={(e) => e.preventDefault()}>
      <div className="space-y-1">
        <label htmlFor="f-q" className="font-medium">{t("q")}</label>
        <Input id="f-q" value={value.q} onChange={(e) => set("q", e.target.value)} placeholder={t("qPlaceholder")} />
      </div>
      <div className="space-y-1">
        <label htmlFor="f-sp" className="font-medium">{t("specialty")}</label>
        <Select id="f-sp" value={value.specialty} onChange={(e) => set("specialty", e.target.value)}>
          <option value="">{t("any")}</option>
          {SPECIALTIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <label htmlFor="f-conf" className="font-medium">{t("confidence")}</label>
        <Select id="f-conf" value={value.confidence} onChange={(e) => set("confidence", e.target.value as HospitalFilterValues["confidence"])}>
          <option value="">{t("any")}</option>
          {(["confirmed", "reported", "unknown"] as const).map((x) => (
            <option key={x} value={x}>{conf(`${x}.label`)}</option>
          ))}
        </Select>
      </div>
      <Checkbox label={t("emergency24x7")} checked={value.emergency24x7} onChange={(e) => set("emergency24x7", e.target.checked)} />
      <Checkbox label={t("verifiedOnly")} checked={value.verifiedOnly} onChange={(e) => set("verifiedOnly", e.target.checked)} />
      <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
        <RotateCcw aria-hidden="true" className="h-4 w-4" />
        {t("reset")}
      </Button>
    </form>
  );
}
