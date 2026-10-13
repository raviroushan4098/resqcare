import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function signInAs(page: Page, uid: string) {
  await page.goto("/");
  await page.evaluate((u) => sessionStorage.setItem("rq-demo-uid", u), uid);
}

export async function api(page: Page, method: string, path: string, uid: string, body?: unknown) {
  return page.request.fetch(`/api${path}`, {
    method,
    headers: { authorization: `Bearer demo.${uid}`, "content-type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function setScenario(page: Page, scenario: string) {
  await page.context().addCookies([{ name: "rq-scenario", value: scenario, url: "http://localhost:3000" }]);
}

/** Zero serious or critical axe violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
}

export async function expectEmergencyBar(page: Page) {
  await expect(page.getByRole("link", { name: "Call emergency services 112" }).first()).toBeVisible();
}
