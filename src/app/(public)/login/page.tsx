"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { PageShell } from "@/components/shared/PageShell";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { GuestEmergencyLink } from "@/components/shared/GuestEmergencyLink";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DEMO_ACCOUNTS, HOME_FOR_ROLE, safeNext } from "@/lib/roles";

/** Firebase error codes collapse to non-revealing messages (never "no such email"). */
function authErrorKey(code: string | undefined): "invalid" | "disabled" | "tooMany" | "network" | "unverified" {
  if (code === "auth/user-disabled") return "disabled";
  if (code === "auth/too-many-requests") return "tooMany";
  if (code === "auth/network-request-failed") return "network";
  if (code === "email_unverified") return "unverified";
  return "invalid";
}

function LoginView() {
  const t = useTranslations("auth");
  const tr = useTranslations("roles");
  usePageTitle(t("loginTitle"));
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "");
  const { mode, signInDemo, refresh } = useAuth();
  const otp = usePhoneVerification();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const done = async () => {
    const me = await refresh();
    router.replace(next || (me ? HOME_FOR_ROLE[me.role] : "/"));
  };

  async function firebaseEmail() {
    setBusy(true);
    setError(null);
    try {
      const [{ firebaseAuth }, { signInWithEmailAndPassword }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      const cred = await signInWithEmailAndPassword(firebaseAuth(), email, password);
      if (!cred.user.emailVerified) throw Object.assign(new Error("unverified"), { code: "email_unverified" });
      await done();
    } catch (e) {
      setError(t(`errors.${authErrorKey((e as { code?: string }).code)}`));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const [{ firebaseAuth }, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
      await done();
    } catch (e) {
      setError(t(`errors.${authErrorKey((e as { code?: string }).code)}`));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    try {
      const [{ firebaseAuth }, { sendPasswordResetEmail }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      await sendPasswordResetEmail(firebaseAuth(), email);
    } catch {
      /* same message either way: never reveal whether the email exists */
    }
    setResetSent(true);
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-md space-y-4">
        <GuestEmergencyLink />
        <Card className="space-y-4">
          <h1>{t("loginTitle")}</h1>
          {error ? <StatusBanner variant="error" title={error} /> : null}
          {mode === "demo" ? (
            <div className="space-y-3">
              <StatusBanner variant="demo" title={t("demoTitle")} description={t("demoBody")} />
              <div className="grid gap-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <Button
                    key={a.uid}
                    variant="outline"
                    size="lg"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const me = await signInDemo(a.uid);
                        router.replace(next || HOME_FOR_ROLE[me.role]);
                      } catch {
                        setError(t("errors.network"));
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                  >
                    {t("continueAs", { role: tr(a.role) })}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void firebaseEmail())}>
                <Field label={t("email")} required>
                  {({ id }) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
                </Field>
                <Field label={t("password")} required>
                  {({ id }) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
                </Field>
                <Button type="submit" size="lg" block loading={busy}>{t("signIn")}</Button>
                <Button variant="ghost" size="sm" onClick={() => void forgot()} disabled={!email}>{t("forgot")}</Button>
                {resetSent ? <StatusBanner variant="info" title={t("resetSent")} /> : null}
              </form>
              <Button variant="outline" size="lg" block onClick={() => void google()} disabled={busy}>{t("google")}</Button>
              <div className="space-y-2 border-t border-border pt-3">
                <p className="font-medium">{t("phoneTitle")}</p>
                {otp.state === "idle" || otp.state === "error" || otp.state === "sending" ? (
                  <div className="flex gap-2">
                    <label htmlFor="login-phone" className="sr-only">{t("phone")}</label>
                    <Input id="login-phone" type="tel" placeholder="+91" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <Button onClick={() => void otp.send(phone.startsWith("+") ? phone : `+91${phone}`)} loading={otp.state === "sending"}>{t("sendCode")}</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label htmlFor="login-code" className="sr-only">{t("code")}</label>
                    <Input id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
                    <Button onClick={async () => (await otp.verify(code)) && (await done())} loading={otp.state === "verifying"}>{t("verify")}</Button>
                  </div>
                )}
                {otp.error ? <p className="text-sm font-medium text-emergency">{t(`errors.${otp.error === "invalid_code" ? "invalid" : "network"}`)}</p> : null}
                <div id="recaptcha-container" />
              </div>
            </>
          )}
          <p className="text-sm">
            {t("noAccount")} <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary underline">{t("register")}</Link>
          </p>
        </Card>
      </div>
    </PageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
