import { scenariosEnabled } from "../config/env";

/** Dev-only scenario switch, set by the dev panel as the `rq-scenario` cookie. */
export const SCENARIOS = [
  "normal", "ai-down", "maps-down", "no-match", "slow", "offline", "rate-limited", "forbidden", "demo-on", "demo-off",
] as const;
export type Scenario = (typeof SCENARIOS)[number];
export const SCENARIO_COOKIE = "rq-scenario";

export function readScenario(req: Request): Scenario {
  if (!scenariosEnabled()) return "normal";
  const cookie = req.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|;\\s*)${SCENARIO_COOKIE}=([a-z-]+)`).exec(cookie);
  const v = m?.[1];
  return (SCENARIOS as readonly string[]).includes(v ?? "") ? (v as Scenario) : "normal";
}
