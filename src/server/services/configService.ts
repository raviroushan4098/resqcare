import { AdminConfigSchema, weightsTotal, type AdminConfig, type DemoSettings, type PublicConfig, type Weights } from "@/lib/schemas";
import { DEFAULT_DEMO, DEFAULT_FRESHNESS, DEFAULT_SEARCH, DEFAULT_WEIGHTS } from "../config/constants";
import { env } from "../config/env";
import type { DocStore } from "../db/store";
import { ruleViolation } from "../errors/AppError";
import type { Ctx } from "../http/router";
import type { Scenario } from "../http/scenario";
import { C } from "../repositories/collections";
import { DEMO_CITY } from "../seed/data";
import { audit } from "./auditService";

export interface FullConfig {
  weights: Weights;
  freshness: { availabilityMinutes: number; facilityDays: number };
  search: { defaultRadiusKm: number; maxRadiusKm: number; radiusOptionsKm: number[] };
  demo: DemoSettings;
  emergency: { national: string; ambulance: string; ambulanceAlt: string };
}

export async function getConfig(store: DocStore, scenario: Scenario = "normal"): Promise<FullConfig> {
  const [ranking, freshness, search, demo, emergency] = await Promise.all(
    ["ranking", "freshness", "search", "demo", "emergency"].map((id) => store.get<Record<string, unknown>>(C.config, id)),
  );
  const demoDoc = {
    demoMode: (demo?.demoMode as boolean | undefined) ?? env().DEMO_MODE_DEFAULT,
    simulateDispatch: (demo?.simulateDispatch as boolean | undefined) ?? DEFAULT_DEMO.simulateDispatch,
    acceptDelaySec: (demo?.acceptDelaySec as number | undefined) ?? DEFAULT_DEMO.acceptDelaySec,
    stepDelaySec: (demo?.stepDelaySec as number | undefined) ?? DEFAULT_DEMO.stepDelaySec,
  };
  if (scenario === "demo-on") demoDoc.demoMode = true;
  if (scenario === "demo-off") demoDoc.demoMode = false;
  return {
    weights: (ranking?.weights as Weights | undefined) ?? { ...DEFAULT_WEIGHTS },
    freshness: {
      availabilityMinutes: (freshness?.availabilityMinutes as number | undefined) ?? DEFAULT_FRESHNESS.availabilityMinutes,
      facilityDays: (freshness?.facilityDays as number | undefined) ?? DEFAULT_FRESHNESS.facilityDays,
    },
    search: {
      defaultRadiusKm: (search?.defaultRadiusKm as number | undefined) ?? DEFAULT_SEARCH.defaultRadiusKm,
      maxRadiusKm: (search?.maxRadiusKm as number | undefined) ?? DEFAULT_SEARCH.maxRadiusKm,
      radiusOptionsKm: (search?.radiusOptionsKm as number[] | undefined) ?? [5, 10, 15, 25],
    },
    demo: demoDoc,
    emergency: {
      national: (emergency?.national as string | undefined) ?? "112",
      ambulance: (emergency?.ambulance as string | undefined) ?? "108",
      ambulanceAlt: (emergency?.ambulanceAlt as string | undefined) ?? "102",
    },
  };
}

export function toPublicConfig(cfg: FullConfig): PublicConfig {
  return {
    demoMode: cfg.demo.demoMode,
    emergencyNumbers: cfg.emergency,
    categories: ["cardiac", "stroke", "accident", "breathing", "trauma", "other"],
    radiusOptionsKm: cfg.search.radiusOptionsKm.filter((r) => r <= cfg.search.maxRadiusKm),
    defaultRadiusKm: cfg.search.defaultRadiusKm,
    maxRadiusKm: cfg.search.maxRadiusKm,
    freshness: cfg.freshness,
    demoCity: { ...DEMO_CITY },
    mapsEnabled: Boolean(env().NEXT_PUBLIC_GOOGLE_MAPS_KEY),
  };
}

export const toAdminConfig = (cfg: FullConfig): AdminConfig => ({
  weights: cfg.weights,
  freshness: cfg.freshness,
  search: { defaultRadiusKm: cfg.search.defaultRadiusKm, maxRadiusKm: cfg.search.maxRadiusKm },
  demoMode: cfg.demo.demoMode,
});

/** Weights must sum to exactly 1.00 (RULE_VIOLATION otherwise). Every change is audit logged. */
export async function updateAdminConfig(ctx: Ctx, input: AdminConfig) {
  const parsed = AdminConfigSchema.parse(input);
  const total = weightsTotal(parsed.weights);
  if (total !== 1) {
    throw ruleViolation(`Ranking weights must add up to 1.00 (currently ${total.toFixed(2)})`, [{ path: "weights", issue: "sum_not_one" }]);
  }
  const before = toAdminConfig(await getConfig(ctx.store));
  const at = ctx.now.toISOString();
  const demo = (await ctx.store.get<Record<string, unknown>>(C.config, "demo")) ?? {};
  const search = (await ctx.store.get<Record<string, unknown>>(C.config, "search")) ?? {};
  await Promise.all([
    ctx.store.set(C.config, "ranking", { id: "ranking", weights: parsed.weights, updatedAt: at }),
    ctx.store.set(C.config, "freshness", { id: "freshness", ...parsed.freshness, updatedAt: at }),
    ctx.store.set(C.config, "search", { ...search, id: "search", ...parsed.search, updatedAt: at }),
    ctx.store.set(C.config, "demo", { ...demo, id: "demo", demoMode: parsed.demoMode, updatedAt: at }),
  ]);
  await audit(ctx, { action: "config.update", resourceType: "systemConfiguration", resourceId: "all", before, after: parsed });
  return parsed;
}

export async function updateDemoSettings(ctx: Ctx, input: DemoSettings) {
  const before = (await getConfig(ctx.store)).demo;
  await ctx.store.set(C.config, "demo", { id: "demo", ...input, updatedAt: ctx.now.toISOString() });
  await audit(ctx, { action: "demo.update", resourceType: "systemConfiguration", resourceId: "demo", before, after: input });
  return input;
}
