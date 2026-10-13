import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Run with: pnpm test:rules  (starts the Firestore emulator; needs firebase-tools and Java).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/rules/**/*.rules.test.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    env: { DATA_BACKEND: "firestore", AUTH_MODE: "demo", DEV_SCENARIOS: "true", FIREBASE_PROJECT_ID: "demo-resqcare", CRON_SECRET: "test-cron-secret" },
  },
});
