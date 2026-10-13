"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LocationGate, type PickedLocation } from "@/components/emergency/LocationGate";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";
import { isApiError } from "@/lib/api";
import { LIMITS } from "@/lib/constants";
import { formatPhone } from "@/lib/format";
import type { AmbulanceType, CreateBookingInput } from "@/lib/schemas";

const PHONE_RE = /^(\+91)?[6-9]\d{9}$/;
const normalisePhone = (p: string) => {
  const s = p.replace(/[\s-]/g, "");
  return s.startsWith("+91") ? s : `+91${s}`;
};

type Step = "pickup" | "details" | "contact" | "review";
const STEPS: Step[] = ["pickup", "details", "contact", "review"];

/**
 * Ambulance request. The idempotency key is generated once on mount and reused
 * for every retry, and a ref guard plus disabled button stop double submits.
 */
export function BookingForm({
  preselected,
  signedIn,
  fallbackCenter,
  onSubmit,
  onNoProviders,
}: {
  preselected?: { id: string; name: string } | null;
  signedIn: boolean;
  fallbackCenter?: { lat: number; lng: number; name: string };
  onSubmit: (body: CreateBookingInput, idempotencyKey: string) => Promise<unknown>;
  onNoProviders: () => void;
}) {
  const t = useTranslations("bookingForm");
  const ty = useTranslations("ambulanceTypes");
  const msg = useApiErrorMessage();
  const otp = usePhoneVerification();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);

  const [step, setStep] = useState<Step>("pickup");
  const [pickup, setPickup] = useState<PickedLocation | null>(null);
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(false);
  const [destination, setDestination] = useState<string | null>(preselected?.id ?? null);
  const destinationTouched = useRef(false);
  // The preselected hospital usually loads after mount; adopt it unless the user already chose.
  useEffect(() => {
    if (preselected && !destinationTouched.current) setDestination(preselected.id);
  }, [preselected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [type, setType] = useState<AmbulanceType>("basic");
  const [patientCount, setPatientCount] = useState(1);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const verified = signedIn || otp.state === "verified";
  const idx = STEPS.indexOf(step);
  const headingId = `step-${step}`;

  function validate(s: Step) {
    const e: Record<string, string> = {};
    if (s === "pickup") {
      if (!pickup) e.pickup = t("errors.pickup");
      if (!consent) e.consent = t("errors.consent");
    }
    if (s === "contact") {
      if (!name.trim()) e.name = t("errors.name");
      if (!PHONE_RE.test(phone.replace(/[\s-]/g, ""))) e.phone = t("errors.phone");
      if (!verified && !e.phone) e.otp = t("errors.otp");
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => validate(step) && setStep(STEPS[idx + 1]!);
  const back = () => setStep(STEPS[idx - 1]!);

  async function submit() {
    if (inFlight.current) return; // second tap ignored
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(
        {
          pickup: { lat: pickup!.lat, lng: pickup!.lng, address: address.trim() || pickup!.label, consent: true },
          destinationHospitalId: destination,
          type,
          patientCount,
          note: note.trim() || undefined,
          contact: { name: name.trim(), phone: normalisePhone(phone) },
        },
        idempotencyKey,
      );
    } catch (e) {
      if (isApiError(e) && e.details.some((d) => d.issue === "no_providers_in_range")) onNoProviders();
      else setSubmitError(msg(e));
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-4">
      <ol className="flex gap-2" aria-label={t("progress")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={`h-2 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-border"}`}>
            <span className="sr-only">{t(`steps.${s}`)}</span>
          </li>
        ))}
      </ol>
      <h2 id={headingId} tabIndex={-1}>{t(`steps.${step}`)}</h2>

      {step === "pickup" ? (
        <div className="space-y-4">
          <LocationGate value={pickup} onChange={setPickup} fallbackCenter={fallbackCenter} purpose="pickup" />
          {errors.pickup ? <p className="text-sm font-medium text-emergency">{errors.pickup}</p> : null}
          <Field label={t("address")} hint={t("addressHint")}>
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />}
          </Field>
          <div>
            <Checkbox label={t("consent")} checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent} />
            {errors.consent ? <p className="text-sm font-medium text-emergency">{errors.consent}</p> : null}
          </div>
        </div>
      ) : null}

      {step === "details" ? (
        <div className="space-y-4">
          <Field label={t("destination")}>
            {({ id }) => (
              <Select id={id} value={destination ?? ""} onChange={(e) => ((destinationTouched.current = true), setDestination(e.target.value || null))}>
                <option value="">{t("nearestSuitable")}</option>
                {preselected ? <option value={preselected.id}>{preselected.name}</option> : null}
              </Select>
            )}
          </Field>
          <fieldset>
            <legend className="font-medium">{t("type")}</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {(["basic", "als"] as const).map((v) => (
                <label key={v} className={`grid min-h-emergency cursor-pointer grid-cols-[auto,1fr] items-center gap-x-3 rounded-control border-2 p-3 ${type === v ? "border-primary bg-tint-primary" : "border-border"}`}>
                  <input type="radio" name="amb-type" checked={type === v} onChange={() => setType(v)} className="row-span-2 h-5 w-5 accent-[var(--primary)]" />
                  <span className="font-semibold">{ty(v)}</span>
                  <span className="text-sm text-muted">{t(`typeHint.${v}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t("patients")}>
            {({ id }) => (
              <Select id={id} value={patientCount} onChange={(e) => setPatientCount(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("note")} hint={t("noteHint")}>
            {({ id, describedBy }) => (
              <>
                <Textarea id={id} aria-describedby={describedBy} rows={2} maxLength={LIMITS.bookingNoteMax} value={note} onChange={(e) => setNote(e.target.value)} />
                <p className="text-right text-sm text-muted">{t("counter", { count: note.length, max: LIMITS.bookingNoteMax })}</p>
              </>
            )}
          </Field>
        </div>
      ) : null}

      {step === "contact" ? (
        <div className="space-y-4">
          <Field label={t("name")} required error={errors.name}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} autoComplete="name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label={t("phone")} required hint={t("phoneHint")} error={errors.phone}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="tel" inputMode="tel" autoComplete="tel" aria-describedby={describedBy} aria-invalid={invalid} value={phone} disabled={otp.state === "verified"} onChange={(e) => setPhone(e.target.value)} />
            )}
          </Field>
          {verified ? (
            <p className="flex items-center gap-2 font-medium text-confirmed">
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
              {otp.state === "verified" ? t("phoneVerified") : t("signedInNoOtp")}
            </p>
          ) : (
            <div className="space-y-3 rounded-control border border-border p-3">
              <p className="text-sm">{t("otpWhy")}</p>
              {otp.state === "idle" || otp.state === "error" || otp.state === "sending" ? (
                <Button
                  variant="secondary"
                  loading={otp.state === "sending"}
                  onClick={() => {
                    if (!PHONE_RE.test(phone.replace(/[\s-]/g, ""))) return setErrors({ phone: t("errors.phone") });
                    void otp.send(normalisePhone(phone));
                  }}
                >
                  {t("sendCode")}
                </Button>
              ) : (
                <div className="space-y-2">
                  {otp.isDemo ? <StatusBanner variant="demo" title={t("demoOtp")} /> : <p className="text-sm">{t("codeSent", { phone: formatPhone(normalisePhone(phone)) })}</p>}
                  <Field label={t("code")} error={otp.error === "invalid_code" ? t("errors.code") : undefined}>
                    {({ id, describedBy, invalid }) => (
                      <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-describedby={describedBy} aria-invalid={invalid} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                    )}
                  </Field>
                  <Button onClick={() => void otp.verify(code)} loading={otp.state === "verifying"} disabled={code.length !== 6}>
                    {t("verify")}
                  </Button>
                </div>
              )}
              {otp.error === "send_failed" ? <p className="text-sm font-medium text-emergency">{t("errors.send")}</p> : null}
              {errors.otp ? <p className="text-sm font-medium text-emergency">{errors.otp}</p> : null}
              <div id="recaptcha-container" />
            </div>
          )}
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-3">
          <p>{t("reviewIntro")}</p>
          <dl className="grid grid-cols-1 gap-2 rounded-control bg-bg p-3 sm:grid-cols-[auto,1fr]">
            <dt className="font-semibold">{t("pickupShort")}</dt>
            <dd>{address.trim() || pickup?.label || t("currentLocation")}</dd>
            <dt className="font-semibold">{t("destination")}</dt>
            <dd>{destination ? preselected?.name : t("nearestSuitable")}</dd>
            <dt className="font-semibold">{t("type")}</dt>
            <dd>{ty(type)} · {t("patientsN", { count: patientCount })}</dd>
            <dt className="font-semibold">{t("contactShort")}</dt>
            <dd>{name} · {formatPhone(normalisePhone(phone))}</dd>
          </dl>
          <div className="rounded-control border border-border p-3 text-sm">
            <p className="font-semibold">{t("sharedWith")}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>{t("shareProvider")}</li>
              <li>{t("shareDriver")}</li>
              <li>{t("shareHospital")}</li>
            </ul>
          </div>
          <p className="text-sm text-muted">{t("requestedNote")}</p>
          {submitError ? <StatusBanner variant="error" title={submitError} action={<Button size="sm" variant="outline" onClick={() => void submit()}>{t("retry")}</Button>} /> : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {idx > 0 ? (
          <Button variant="outline" size="lg" onClick={back} disabled={submitting}>
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            {t("back")}
          </Button>
        ) : <span />}
        {step === "review" ? (
          <Button size="lg" onClick={() => void submit()} loading={submitting} disabled={submitting}>
            <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
            {t("confirm")}
          </Button>
        ) : (
          <Button size="lg" onClick={next}>
            {t("next")}
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </Button>
        )}
      </div>
    </Card>
  );
}
