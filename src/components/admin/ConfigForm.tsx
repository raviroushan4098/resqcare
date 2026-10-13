"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Switch } from "@/components/ui/field";
import { WEIGHT_KEYS, weightsTotal, type AdminConfig } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Ranking weights (sliders + numbers) with a live total; submit only when the total is exactly 1.00. */
export function ConfigForm({ initial, onSave }: { initial: AdminConfig; onSave: (c: AdminConfig) => Promise<unknown> }) {
  const t = useTranslations("admin.config");
  const msg = useApiErrorMessage();
  const [cfg, setCfg] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const total = weightsTotal(cfg.weights);
  const valid = total === 1 && cfg.search.defaultRadiusKm <= cfg.search.maxRadiusKm;
  const setW = (k: (typeof WEIGHT_KEYS)[number], v: number) => setCfg({ ...cfg, weights: { ...cfg.weights, [k]: Math.round(Math.max(0, Math.min(1, v)) * 100) / 100 } });

  async function save(next = cfg) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(next);
      setSaved(true);
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-5">
      <h2 className="text-lg">{t("title")}</h2>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void save();
        }}
      >
        <fieldset className="space-y-3">
          <legend className="font-semibold">{t("weights")}</legend>
          {WEIGHT_KEYS.map((k) => (
            <div key={k} className="grid grid-cols-[1fr,auto] items-center gap-3 sm:grid-cols-[160px,1fr,96px]">
              <label htmlFor={`w-${k}`} className="font-medium">{t(`weight.${k}`)}</label>
              <input aria-label={t(`weight.${k}`)} type="range" min={0} max={1} step={0.05} value={cfg.weights[k]} onChange={(e) => setW(k, Number(e.target.value))} className="col-span-2 accent-[var(--primary)] sm:col-span-1" />
              <Input id={`w-${k}`} type="number" min={0} max={1} step={0.01} value={cfg.weights[k]} onChange={(e) => setW(k, Number(e.target.value))} className="w-24" />
            </div>
          ))}
          <p aria-live="polite" className={cn("flex items-center gap-2 font-semibold", total === 1 ? "text-confirmed" : "text-emergency")}>
            {total === 1 ? <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> : <XCircle aria-hidden="true" className="h-5 w-5" />}
            {t("total", { total: total.toFixed(2) })}
            {total !== 1 ? <span className="font-normal">{t("mustEqual")}</span> : null}
          </p>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">{t("freshness")}</legend>
          <div>
            <label htmlFor="c-avail" className="font-medium">{t("availabilityMinutes")}</label>
            <Input id="c-avail" type="number" min={5} max={1440} value={cfg.freshness.availabilityMinutes} onChange={(e) => setCfg({ ...cfg, freshness: { ...cfg.freshness, availabilityMinutes: Number(e.target.value) } })} />
          </div>
          <div>
            <label htmlFor="c-fac" className="font-medium">{t("facilityDays")}</label>
            <Input id="c-fac" type="number" min={1} max={365} value={cfg.freshness.facilityDays} onChange={(e) => setCfg({ ...cfg, freshness: { ...cfg.freshness, facilityDays: Number(e.target.value) } })} />
          </div>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">{t("radius")}</legend>
          <div>
            <label htmlFor="c-def" className="font-medium">{t("defaultRadius")}</label>
            <Input id="c-def" type="number" min={1} max={100} value={cfg.search.defaultRadiusKm} onChange={(e) => setCfg({ ...cfg, search: { ...cfg.search, defaultRadiusKm: Number(e.target.value) } })} />
          </div>
          <div>
            <label htmlFor="c-max" className="font-medium">{t("maxRadius")}</label>
            <Input id="c-max" type="number" min={1} max={100} value={cfg.search.maxRadiusKm} onChange={(e) => setCfg({ ...cfg, search: { ...cfg.search, maxRadiusKm: Number(e.target.value) } })} />
          </div>
        </fieldset>
        {error ? <StatusBanner variant="error" title={error} /> : null}
        {saved ? <StatusBanner variant="info" title={t("saved")} /> : null}
        <Button type="submit" disabled={!valid} loading={saving}>{t("save")}</Button>
      </form>
      <div className="border-t border-border pt-4">
        <Switch checked={cfg.demoMode} onChange={() => setConfirmDemo(true)} label={t("demoMode")} description={t("demoModeHint")} />
        <ConfirmDialog
          open={confirmDemo}
          onOpenChange={setConfirmDemo}
          title={cfg.demoMode ? t("demoOffTitle") : t("demoOnTitle")}
          description={cfg.demoMode ? t("demoOffBody") : t("demoOnBody")}
          confirmLabel={t("confirm")}
          destructive={cfg.demoMode}
          onConfirm={async () => {
            const next = { ...cfg, demoMode: !cfg.demoMode };
            setCfg(next);
            await save(next);
          }}
        />
      </div>
    </Card>
  );
}
