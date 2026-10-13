import "server-only";
import type { Category } from "@/lib/schemas";
import { recordHealth } from "../health";
import { geminiPreferredCapabilities } from "./gemini";
import { ruleBasedIntent, type Intent } from "./ruleBased";

export type { Intent };

/**
 * Builds the search intent. Falls back to rule-based matching (degraded=true)
 * when AI is unconfigured, times out, or returns invalid output.
 */
export async function extractIntent(
  category: Category,
  text: string | undefined,
  opts: { forceFail?: boolean; ai?: typeof geminiPreferredCapabilities } = {},
): Promise<{ intent: Intent; degraded: boolean }> {
  const base = ruleBasedIntent(category, text);
  if (opts.forceFail) return { intent: base, degraded: true };
  if (!text || text.trim().length < 3) return { intent: base, degraded: false };
  try {
    const extra = await (opts.ai ?? geminiPreferredCapabilities)(category, text);
    recordHealth("ai", true);
    const preferred = [...new Set([...base.preferredCapabilities, ...extra])].filter((c) => !base.requiredCapabilities.includes(c));
    return { intent: { ...base, preferredCapabilities: preferred, source: "ai" }, degraded: false };
  } catch (e) {
    const msg = (e as Error).message;
    recordHealth("ai", false, msg === "not_configured" ? "GEMINI_API_KEY not set" : "fallback used");
    return { intent: base, degraded: true };
  }
}
