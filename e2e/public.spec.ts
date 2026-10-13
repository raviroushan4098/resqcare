import { expect, test } from "@playwright/test";
import { expectAccessible, expectEmergencyBar, setScenario } from "./helpers";

test("home: primary action visible without scrolling at 360px, emergency bar present", async ({ page }) => {
  await page.goto("/");
  const cta = page.getByRole("link", { name: "Find a hospital now" });
  await expect(cta).toBeInViewport();
  await expectEmergencyBar(page);
  await expect(page.getByRole("link", { name: "Call emergency services 112" }).first()).toHaveAttribute("href", "tel:112");
  await expectAccessible(page);
});

test("emergency search: manual location, results with tiers and estimates, then hospital detail", async ({ page }) => {
  await page.goto("/emergency?category=stroke");
  await page.getByRole("button", { name: "Enter address or place" }).click();
  await page.getByRole("button", { name: "Pari Chowk, Greater Noida" }).click();
  await page.getByRole("radio", { name: /25 km/ }).check({ force: true });
  const started = Date.now();
  await page.getByRole("button", { name: "Find hospitals" }).click();
  const first = page.getByRole("list", { name: "Ranked hospitals" }).getByRole("listitem").filter({ has: page.getByRole("link", { name: /^Call / }) }).first();
  await expect(first).toBeVisible();
  expect(Date.now() - started).toBeLessThan(5000);
  await expect(first.getByText(/\(estimate\)/).first()).toBeVisible();
  await expect(first.getByText(/Confirmed|Reported, call to confirm|Unknown/).first()).toBeVisible();
  await expectEmergencyBar(page);
  await expectAccessible(page);
  await first.getByRole("link", { name: /Details/ }).click();
  await expect(page.getByRole("heading", { name: "Patient opinions" })).toBeVisible();
  await expect(page.getByText("Opinions, not clinical information.", { exact: false }).first()).toBeVisible();
  await expectAccessible(page);
});

test("AI down: still returns results with the degraded notice", async ({ page }) => {
  await setScenario(page, "ai-down");
  await page.goto("/emergency?category=other");
  await page.getByRole("button", { name: "Enter address or place" }).click();
  await page.getByRole("button", { name: "Alpha 1, Greater Noida" }).click();
  await page.getByRole("button", { name: "Find hospitals" }).click();
  await expect(page.getByText("Smart matching unavailable, showing standard matching.")).toBeVisible();
  await expect(page.getByText(/hospitals? found/)).toBeVisible();
});

test("no confident match: nearest hospitals and emergency numbers", async ({ page }) => {
  await setScenario(page, "no-match");
  await page.goto("/emergency?category=cardiac");
  await page.getByRole("button", { name: "Find hospitals" }).click();
  await expect(page.getByRole("heading", { name: "We could not find a confident match" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nearest hospitals to call" })).toBeVisible();
});

test("offline: banner shows and emergency numbers still work", async ({ page }) => {
  await setScenario(page, "offline");
  await page.goto("/hospitals");
  await expect(page.getByText("You are offline. Emergency numbers still work.")).toBeVisible();
  await expectEmergencyBar(page);
});

test("Hindi switch works without a full reload", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => ((window as unknown as { __m: number }).__m = 1));
  await page.getByRole("button", { name: "हिन्दी" }).click();
  await expect(page.getByRole("link", { name: "अभी अस्पताल खोजें" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  expect(await page.evaluate(() => (window as unknown as { __m?: number }).__m)).toBe(1);
  await expectAccessible(page);
  await page.getByRole("button", { name: "English" }).click();
});

test("hospital browse works without location and limits compare to 3", async ({ page }) => {
  await page.goto("/hospitals");
  const boxes = page.getByRole("checkbox", { name: "Compare" });
  await expect(boxes.first()).toBeVisible();
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await expect(boxes.nth(3)).toBeDisabled();
  await page.getByRole("button", { name: "Compare (3)" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectAccessible(page);
});
