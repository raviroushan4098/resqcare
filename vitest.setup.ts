import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { configureApi } from "@/lib/api";
import { server } from "@/test/msw";

expect.extend(toHaveNoViolations);

configureApi({ retryBaseMs: 0 });

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
    document.cookie = "rq-scenario=; path=/; max-age=0";
  }
  server.resetHandlers();
});
afterAll(() => server.close());
