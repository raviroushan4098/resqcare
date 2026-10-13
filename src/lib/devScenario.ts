/**
 * Client side of the dev scenario switch. The server reads the same
 * `rq-scenario` cookie (only when DEV_SCENARIOS=true and not in production).
 * `offline` is simulated in the browser: the API wrapper fails fast and the
 * OfflineBar shows.
 */
export const SCENARIOS = [
  "normal", "ai-down", "maps-down", "no-match", "slow", "offline", "rate-limited", "forbidden", "demo-on", "demo-off",
] as const;
export type Scenario = (typeof SCENARIOS)[number];
const COOKIE = "rq-scenario";
const EVENT = "rq:scenario";

export function getScenario(): Scenario {
  if (typeof document === "undefined") return "normal";
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-z-]+)`).exec(document.cookie);
  return (SCENARIOS as readonly string[]).includes(m?.[1] ?? "") ? (m![1] as Scenario) : "normal";
}

export function setScenario(s: Scenario) {
  document.cookie = s === "normal" ? `${COOKIE}=; path=/; max-age=0; samesite=lax` : `${COOKIE}=${s}; path=/; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeScenario(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Lets links like /emergency?scenario=ai-down switch scenario. */
export function readScenarioFromUrl() {
  const s = new URLSearchParams(window.location.search).get("scenario");
  if (s && (SCENARIOS as readonly string[]).includes(s)) setScenario(s as Scenario);
}

export const devToolsEnabled = () => process.env.NEXT_PUBLIC_DEV_TOOLS !== "false" && process.env.NODE_ENV !== "production";
