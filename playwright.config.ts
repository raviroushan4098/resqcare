import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the real app with the seeded in-memory
 * backend and demo auth (no Firebase or Google keys needed).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DATA_BACKEND: "memory", AUTH_MODE: "demo", NEXT_PUBLIC_AUTH_MODE: "demo", DEV_SCENARIOS: "true" },
  },
});
