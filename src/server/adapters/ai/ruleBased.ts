import type { Capability, Category } from "@/lib/schemas";
import { KEYWORD_CAPABILITIES, REQUIRED_CAPABILITIES } from "../../domain/capabilityMap";

export interface Intent {
  category: Category;
  requiredCapabilities: Capability[];
  preferredCapabilities: Capability[];
  source: "ai" | "rule";
}

export function ruleBasedIntent(category: Category, text?: string): Intent {
  const required = REQUIRED_CAPABILITIES[category];
  const preferred = text
    ? [...new Set(KEYWORD_CAPABILITIES.filter(([re]) => re.test(text)).map(([, c]) => c))].filter((c) => !required.includes(c))
    : [];
  return { category, requiredCapabilities: [...required], preferredCapabilities: preferred, source: "rule" };
}
