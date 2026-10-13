"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { GuestEmergencyLink } from "@/components/shared/GuestEmergencyLink";
import { PageShell } from "@/components/shared/PageShell";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { safeNext } from "@/lib/roles";

/**
 * Minimal registration. The role is always "patient": hospital, provider and
 * driver accounts come only from invitation or an approved application.
 */
function RegisterView() {
  const t = useTranslations("auth");
  usePageTitle(t("registerTitle"));
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/emergency");
  const { mode, signInGuest, refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifySent, setVerifySent] = useState(false);

  async function submit() {
    if (!consent) return setError(t("errors.consent"));
    if (password.length < 8 && mode === "firebase") return setError(t("errors.weakPassword"));
    setBusy(true);
    setError(null);
    try {
      if (mode === "demo") {
        await signInGuest();
        await api.post("/auth/session", { displayName: name.trim(), consent: true });
        await refresh();
        router.replace(next);
        return;
      }
      const [{ firebaseAuth }, { createUserWithEmailAndPassword, sendEmailVerification, updateProfile }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      const cred = await createUserWithEmailAndPassword(firebaseAuth(), email, password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await api.post("/auth/session", { displayName: name.trim(), consent: true });
      await sendEmailVerification(cred.user);
      await refresh();
      setVerifySent(true);
    } catch {
      // Non-revealing: do not say whether the email is already registered.
      setError(t("errors.registerFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-md space-y-4">
        <GuestEmergencyLink />
        <Card className="space-y-4">
          <h1>{t("registerTitle")}</h1>
          <p className="text-sm text-muted">{t("registerNote")}</p>
          {verifySent ? (
            <StatusBanner variant="info" title={t("verifySent")} />
          ) : (
            <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void submit())}>
              <Field label={t("name")} required>
                {({ id }) => <Input id={id} autoComplete="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              {mode === "firebase" ? (
                <>
                  <Field label={t("email")} required>
                    {({ id }) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
                  </Field>
                  <Field label={t("password")} required hint={t("passwordHint")}>
                    {({ id, describedBy }) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />}
                  </Field>
                </>
              ) : (
                <StatusBanner variant="demo" title={t("demoRegister")} />
              )}
              <p className="text-sm"><span className="font-medium">{t("roleLabel")}</span> {t("rolePatient")}</p>
              <Checkbox
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                label={
                  <>
                    {t("consentPrefix")} <Link href="/terms" className="underline">{t("terms")}</Link> {t("and")} <Link href="/privacy" className="underline">{t("privacy")}</Link>
                  </>
                }
              />
              {error ? <StatusBanner variant="error" title={error} /> : null}
              <Button type="submit" size="lg" block loading={busy} disabled={!consent}>{t("createAccount")}</Button>
            </form>
          )}
          <p className="text-sm">
            {t("haveAccount")} <Link href="/login" className="font-medium text-primary underline">{t("signIn")}</Link>
          </p>
          <p className="text-sm text-muted">{t("orgNote")}</p>
        </Card>
      </div>
    </PageShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterView />
    </Suspense>
  );
}
