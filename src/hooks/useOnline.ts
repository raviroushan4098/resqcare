"use client";

import { useSyncExternalStore } from "react";
import { getScenario, subscribeScenario } from "@/lib/devScenario";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  const unsubScenario = subscribeScenario(cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    unsubScenario();
  };
}

function getSnapshot() {
  if (getScenario() === "offline") return false;
  return navigator.onLine;
}

/** True when the browser reports a connection (and the dev `offline` scenario is off). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
