"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AUTH_MODE } from "@/lib/constants";

export const DEMO_OTP = "123456";

/**
 * Phone OTP for guests. Firebase mode uses Firebase phone auth (invisible
 * reCAPTCHA in #recaptcha-container) and the verified phone becomes the
 * signed-in identity. Demo mode accepts 123456 and signs in a demo guest;
 * no SMS is sent.
 */
export function usePhoneVerification() {
  const { signInGuest } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "verifying" | "verified" | "error">("idle");
  const [error, setError] = useState<"invalid_code" | "send_failed" | null>(null);
  const confirmation = useRef<{ confirm: (code: string) => Promise<unknown> } | null>(null);

  const send = useCallback(async (phoneE164: string) => {
    setState("sending");
    setError(null);
    try {
      if (AUTH_MODE === "firebase") {
        const [{ firebaseAuth }, { RecaptchaVerifier, signInWithPhoneNumber }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
        const auth = firebaseAuth();
        const verifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
        confirmation.current = await signInWithPhoneNumber(auth, phoneE164, verifier);
      }
      setState("sent");
    } catch {
      setError("send_failed");
      setState("error");
    }
  }, []);

  const verify = useCallback(
    async (code: string) => {
      setState("verifying");
      setError(null);
      try {
        if (AUTH_MODE === "firebase") {
          await confirmation.current?.confirm(code);
        } else {
          if (code !== DEMO_OTP) throw new Error("invalid");
          await signInGuest();
        }
        setState("verified");
        return true;
      } catch {
        setError("invalid_code");
        setState("sent");
        return false;
      }
    },
    [signInGuest],
  );

  return { state, error, send, verify, isDemo: AUTH_MODE === "demo" };
}
