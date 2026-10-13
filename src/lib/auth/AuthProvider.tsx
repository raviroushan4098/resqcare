"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Me } from "@/lib/schemas";
import { api, configureApi } from "@/lib/api";
import { AUTH_MODE } from "@/lib/constants";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: Status;
  me: Me | null;
  mode: "demo" | "firebase";
  /** Demo mode: sign in as a seeded user (role switcher) or a phone-verified guest. */
  signInDemo: (uid: string) => Promise<Me>;
  signInGuest: () => Promise<Me>;
  signOut: () => Promise<void>;
  /** Firebase mode: after any Firebase sign-in, sync the profile. */
  refresh: () => Promise<Me | null>;
}

const AuthCtx = createContext<AuthState | null>(null);
// Demo identity only (not a secret). Session-scoped, so closing the tab signs out.
const DEMO_KEY = "rq-demo-uid";

function readDemo(): string | null {
  try {
    return window.sessionStorage.getItem(DEMO_KEY);
  } catch {
    return null;
  }
}
function writeDemo(uid: string | null) {
  try {
    if (uid) window.sessionStorage.setItem(DEMO_KEY, uid);
    else window.sessionStorage.removeItem(DEMO_KEY);
  } catch {
    // Private mode: identity lives only in memory for this page.
  }
}

let memoryDemoUid: string | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const qc = useQueryClient();

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.post<Me>("/auth/session", {});
      setMe(data);
      setStatus("signedIn");
      return data;
    } catch {
      setMe(null);
      setStatus("signedOut");
      return null;
    }
  }, []);

  useEffect(() => {
    if (AUTH_MODE === "demo") {
      configureApi({
        tokenProvider: async () => {
          const uid = memoryDemoUid ?? readDemo();
          return uid ? `demo.${uid}` : null;
        },
      });
      memoryDemoUid = readDemo();
      if (memoryDemoUid) void loadMe();
      else setStatus("signedOut");
      return;
    }
    let unsub = () => {};
    void (async () => {
      const { firebaseAuth } = await import("@/lib/firebase");
      const { onIdTokenChanged } = await import("firebase/auth");
      const auth = firebaseAuth();
      configureApi({ tokenProvider: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) });
      unsub = onIdTokenChanged(auth, (u) => {
        if (u) void loadMe();
        else {
          setMe(null);
          setStatus("signedOut");
        }
      });
    })();
    return () => unsub();
  }, [loadMe]);

  const signInDemo = useCallback(
    async (uid: string) => {
      memoryDemoUid = uid;
      writeDemo(uid);
      qc.clear();
      const m = await loadMe();
      if (!m) throw new Error("demo sign-in failed");
      return m;
    },
    [loadMe, qc],
  );

  const signInGuest = useCallback(async () => {
    const id = `guest_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    return signInDemo(id);
  }, [signInDemo]);

  const signOut = useCallback(async () => {
    if (AUTH_MODE === "firebase") {
      const { firebaseAuth } = await import("@/lib/firebase");
      await firebaseAuth().signOut();
    }
    memoryDemoUid = null;
    writeDemo(null);
    qc.clear();
    setMe(null);
    setStatus("signedOut");
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({ status, me, mode: AUTH_MODE, signInDemo, signInGuest, signOut, refresh: loadMe }),
    [status, me, signInDemo, signInGuest, signOut, loadMe],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
