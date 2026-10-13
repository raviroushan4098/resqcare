import { z } from "zod";

export const PublicConfigSchema = z.object({
  demoMode: z.boolean(),
  emergencyNumbers: z.object({ national: z.string(), ambulance: z.string(), ambulanceAlt: z.string() }),
  categories: z.array(z.string()),
  radiusOptionsKm: z.array(z.number().positive()),
  defaultRadiusKm: z.number().positive(),
  maxRadiusKm: z.number().positive(),
  freshness: z.object({
    /** Availability older than this is shown as Reported, not Confirmed. */
    availabilityMinutes: z.number().int().positive(),
    /** Facility verification older than this downgrades to Reported. */
    facilityDays: z.number().int().positive(),
  }),
  demoCity: z.object({ name: z.string(), lat: z.number(), lng: z.number() }),
  mapsEnabled: z.boolean(),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;

export const WEIGHT_KEYS = ["travel", "availability", "freshness", "distance", "specialist", "rating"] as const;
export type WeightKey = (typeof WEIGHT_KEYS)[number];

const weight = z.number().min(0).max(1);
export const WeightsSchema = z.object({
  travel: weight,
  availability: weight,
  freshness: weight,
  distance: weight,
  specialist: weight,
  rating: weight,
});
export type Weights = z.infer<typeof WeightsSchema>;

/** Sum rounded to 2 dp, so 0.1 + 0.2 style float noise never blocks a valid config. */
export const weightsTotal = (w: Weights) => Math.round(WEIGHT_KEYS.reduce((s, k) => s + w[k], 0) * 100) / 100;

export const AdminConfigSchema = z.object({
  weights: WeightsSchema,
  freshness: z.object({
    availabilityMinutes: z.number().int().min(5).max(24 * 60),
    facilityDays: z.number().int().min(1).max(365),
  }),
  search: z
    .object({ defaultRadiusKm: z.number().min(1).max(100), maxRadiusKm: z.number().min(1).max(100) })
    .refine((s) => s.defaultRadiusKm <= s.maxRadiusKm, { message: "default_exceeds_max", path: ["defaultRadiusKm"] }),
  demoMode: z.boolean(),
});
export type AdminConfig = z.infer<typeof AdminConfigSchema>;

export const DemoSettingsSchema = z.object({
  demoMode: z.boolean(),
  simulateDispatch: z.boolean(),
  acceptDelaySec: z.number().int().min(2).max(120),
  stepDelaySec: z.number().int().min(2).max(120),
});
export type DemoSettings = z.infer<typeof DemoSettingsSchema>;
