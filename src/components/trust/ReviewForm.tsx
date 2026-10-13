"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { isApiError } from "@/lib/api";
import { LIMITS } from "@/lib/constants";
import { OpinionDisclaimer } from "./OpinionDisclaimer";
import { StarRating } from "./StarRating";

const Schema = z.object({
  hospitalId: z.string().min(1, "hospital_required"),
  rating: z.number().int().min(1, "rating_required").max(5),
  text: z.string().trim().min(LIMITS.reviewMin, "too_short").max(LIMITS.reviewMax, "too_long"),
  visitDate: z.string().optional(),
});
type Values = z.infer<typeof Schema>;

export function ReviewForm({
  hospitals,
  defaultHospitalId,
  onSubmit,
  submitted,
}: {
  hospitals: { id: string; name: string }[];
  defaultHospitalId?: string;
  onSubmit: (v: Values) => Promise<unknown>;
  submitted?: boolean;
}) {
  const t = useTranslations("reviews");
  const msg = useApiErrorMessage();
  const { register, control, handleSubmit, watch, formState, setError } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { hospitalId: defaultHospitalId ?? "", rating: 0, text: "", visitDate: "" },
  });
  const text = watch("text") ?? "";
  const err = (k: keyof Values) => {
    const m = formState.errors[k]?.message;
    return m ? t(`errors.${m}` as "errors.too_short") : undefined;
  };

  if (submitted) {
    return (
      <StatusBanner variant="info" title={t("pendingTitle")} description={t("pendingBody")} />
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (v) => {
        try {
          await onSubmit({ ...v, visitDate: v.visitDate || undefined });
        } catch (e) {
          if (isApiError(e) && e.details.some((d) => d.issue === "duplicate_review")) {
            setError("root", { message: t("duplicate") });
          } else setError("root", { message: msg(e) });
        }
      })}
    >
      <OpinionDisclaimer />
      <Field label={t("hospital")} required error={err("hospitalId")}>
        {({ id, describedBy, invalid }) => (
          <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register("hospitalId")}>
            <option value="">{t("chooseHospital")}</option>
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </Select>
        )}
      </Field>
      <Controller control={control} name="rating" render={({ field }) => <StarRating value={field.value} onChange={field.onChange} error={err("rating")} />} />
      <Field label={t("text")} required hint={t("textHint", { min: LIMITS.reviewMin, max: LIMITS.reviewMax })} error={err("text")}>
        {({ id, describedBy, invalid }) => (
          <>
            <Textarea id={id} rows={5} maxLength={LIMITS.reviewMax} aria-describedby={describedBy} aria-invalid={invalid} {...register("text")} />
            <p className="text-right text-sm text-muted" aria-live="polite">{t("counter", { count: text.length, max: LIMITS.reviewMax })}</p>
          </>
        )}
      </Field>
      <Field label={t("visitDate")}>
        {({ id }) => <Input id={id} type="date" max={new Date().toISOString().slice(0, 10)} {...register("visitDate")} />}
      </Field>
      {formState.errors.root?.message ? <StatusBanner variant="error" title={formState.errors.root.message} /> : null}
      <Button type="submit" size="lg" block loading={formState.isSubmitting}>
        <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
        {t("submit")}
      </Button>
    </form>
  );
}
