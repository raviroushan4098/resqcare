import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", ""])
  .optional()
  .transform((v) => v === "true");

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATA_BACKEND: z.enum(["memory", "firestore"]).default("memory"),
    AUTH_MODE: z.enum(["demo", "firebase"]).default("demo"),
    DEMO_MODE_DEFAULT: bool.default("true"),
    DEV_SCENARIOS: bool,
    ALLOW_DEMO_AUTH_IN_PRODUCTION: bool,
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    FIREBASE_STORAGE_BUCKET: z.string().optional(),
    FIRESTORE_EMULATOR_HOST: z.string().optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
    GOOGLE_ROUTES_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
    CRON_SECRET: z.string().optional(),
    RATE_LIMIT_SALT: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const usingFirebase = e.DATA_BACKEND === "firestore" || e.AUTH_MODE === "firebase";
    const emulator = Boolean(e.FIRESTORE_EMULATOR_HOST || e.FIREBASE_AUTH_EMULATOR_HOST);
    if (usingFirebase && !e.FIREBASE_PROJECT_ID) {
      ctx.addIssue({ code: "custom", path: ["FIREBASE_PROJECT_ID"], message: "required when using Firebase" });
    }
    if (usingFirebase && !emulator && (!e.FIREBASE_CLIENT_EMAIL || !e.FIREBASE_PRIVATE_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["FIREBASE_PRIVATE_KEY"],
        message: "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required outside the emulator",
      });
    }
    if (e.NODE_ENV === "production" && e.AUTH_MODE === "demo" && !e.ALLOW_DEMO_AUTH_IN_PRODUCTION) {
      ctx.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "demo auth is disabled in production" });
    }
    if (e.NODE_ENV === "production" && !e.RATE_LIMIT_SALT) {
      ctx.addIssue({ code: "custom", path: ["RATE_LIMIT_SALT"], message: "required in production" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Validated server environment. Throws once, at first use, with every problem listed. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = null;
}

export const scenariosEnabled = () => env().NODE_ENV !== "production" && env().DEV_SCENARIOS;
