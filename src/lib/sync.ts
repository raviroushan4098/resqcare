/** Tracks when the app last heard from the API, for the OfflineBar. */
const KEY = "rq-last-sync";
const EVENT = "rq:synced";

export function markSynced(at: Date = new Date()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, at.toISOString());
  } catch {
    // Storage can be unavailable (private mode); the bar just omits the time.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function getLastSync(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function subscribeSync(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
