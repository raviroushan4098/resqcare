import { expect, test } from "@playwright/test";
import { api, expectAccessible, signInAs } from "./helpers";

const ADMIN = "u_admin_demo";

test("guest ambulance request: one booking on double tap, progresses to Completed", async ({ page }) => {
  // Speed up the simulation for the test.
  await api(page, "PUT", "/admin/demo", ADMIN, { demoMode: true, simulateDispatch: true, acceptDelaySec: 2, stepDelaySec: 2 });
  await page.goto("/ambulance");
  await expect(page.getByText("DEMO MODE. No real ambulance is dispatched.")).toBeVisible();
  await page.getByRole("button", { name: "Enter address or place" }).click();
  await page.getByRole("button", { name: "Knowledge Park II, Greater Noida" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("textbox", { name: /Contact name/ }).fill("E2E Guest");
  await page.getByRole("textbox", { name: /Mobile number/ }).fill("9000000000");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByRole("textbox", { name: /6-digit code/ }).fill("123456");
  await page.getByRole("button", { name: "Verify number" }).click();
  await expect(page.getByText("Number verified")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Confirm request" }).dblclick();
  await page.waitForURL(/\/bookings\//);
  const uid = await page.evaluate(() => sessionStorage.getItem("rq-demo-uid"));
  const mine = await (await api(page, "GET", "/bookings", uid!)).json();
  expect(mine.data.items).toHaveLength(1);
  await expect(page.getByRole("heading", { name: /Status: Completed/ })).toBeVisible({ timeout: 60_000 });
  await expectAccessible(page);
  await api(page, "PUT", "/admin/demo", ADMIN, { demoMode: true, simulateDispatch: true, acceptDelaySec: 8, stepDelaySec: 6 });
});

test("stranger cannot open someone else's booking", async ({ page }) => {
  const res = await page.request.fetch("/api/bookings", {
    method: "POST",
    headers: { authorization: "Bearer demo.u_patient_demo", "content-type": "application/json", "idempotency-key": `e2e-stranger-${Date.now()}` },
    data: JSON.stringify({ pickup: { lat: 28.47, lng: 77.5, consent: true }, destinationHospitalId: null, type: "basic", contact: { name: "E2E", phone: "9000000003" }, patientCount: 1 }),
  });
  const id = (await res.json()).data.id as string;
  // Anonymous request is refused, and so is a fresh guest with no relationship to the booking.
  expect((await page.request.get(`/api/bookings/${id}`)).status()).toBe(401);
  await signInAs(page, `guest_stranger${Date.now()}`);
  await page.goto(`/bookings/${id}`);
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await api(page, "POST", `/bookings/${id}/cancel`, "u_patient_demo", {});
});

test("hospital staff updates availability and the public page shows it as Confirmed", async ({ page }) => {
  await signInAs(page, "u_hstaff_demo");
  await page.goto("/hospital/availability");
  // Nudge the count in whichever direction is allowed (it may already be at capacity).
  const inc = page.getByRole("button", { name: "Increase Emergency beds" });
  await expect(inc).toBeVisible();
  if (await inc.isEnabled()) await inc.click();
  else await page.getByRole("button", { name: "Decrease Emergency beds" }).click();
  await page.getByRole("button", { name: "Confirm availability" }).click();
  await expect(page.getByText("Availability updated.", { exact: false })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/hospitals/h-001");
  await expect(page.getByText("Confirmed, updated", { exact: false }).first()).toBeAttached();
  // Staff cannot reach admin-only sections.
  expect((await api(page, "GET", "/hospital/staff", "u_hstaff_demo")).status()).toBe(403);
});

test("admin approves a pending hospital with the checklist", async ({ page }) => {
  await signInAs(page, ADMIN);
  await page.goto("/admin/hospitals?status=pending");
  await page.getByRole("button", { name: /^Open/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Verification checklist" }).or(dialog.getByText("Verification checklist"))).toBeVisible();
  for (const cb of await dialog.getByRole("checkbox").all()) await cb.check();
  await dialog.getByRole("radio", { name: "Reject" }).check();
  await expect(dialog.getByRole("button", { name: "Reject hospital" })).toBeDisabled();
  await dialog.getByRole("radio", { name: "Approve" }).check();
  await dialog.getByRole("button", { name: "Approve hospital" }).click();
  await expect(page.getByText("Decision saved and logged.")).toBeVisible();
});

test("admin cannot save weights that do not sum to 1.00", async ({ page }) => {
  await signInAs(page, ADMIN);
  await page.goto("/admin/dashboard");
  const travel = page.getByRole("spinbutton", { name: "Travel time" });
  await travel.fill("0.9");
  await expect(page.getByRole("button", { name: "Save configuration" })).toBeDisabled();
  await travel.fill("0.3");
  await expect(page.getByRole("button", { name: "Save configuration" })).toBeEnabled();
  await expectAccessible(page);
});

test("dispatcher and driver run a manual trip", async ({ page }) => {
  await api(page, "PUT", "/admin/demo", ADMIN, { demoMode: true, simulateDispatch: false, acceptDelaySec: 8, stepDelaySec: 6 });
  const res = await page.request.fetch("/api/bookings", {
    method: "POST",
    headers: { authorization: "Bearer demo.u_patient_demo", "content-type": "application/json", "idempotency-key": `e2e-${Date.now()}` },
    data: JSON.stringify({ pickup: { lat: 28.47, lng: 77.5, consent: true }, destinationHospitalId: null, type: "basic", contact: { name: "E2E", phone: "9000000001" }, patientCount: 1 }),
  });
  const booking = (await res.json()).data;
  await signInAs(page, "u_dispatch_demo");
  await page.goto("/ambulance/dashboard");
  await page.getByRole("button", { name: "Accept", exact: true }).first().click();
  await page.getByRole("button", { name: "Assign vehicle" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Vehicle" }).selectOption({ label: "DEMO-CC-02 · Basic ambulance" });
  await dialog.getByRole("combobox", { name: "Driver" }).selectOption({ label: "Imran (fictional driver)" });
  await dialog.getByRole("button", { name: "Assign" }).click();
  await expect(dialog).toBeHidden();
  await signInAs(page, "u_driver_demo2");
  await page.goto("/driver/dashboard");
  for (const step of ["Start trip", "Arrived", "Complete trip"]) {
    await page.getByRole("button", { name: step }).click();
    await expect(page.getByRole("button", { name: step })).toBeHidden();
  }
  await expect(page.getByText("No trip assigned")).toBeVisible();
  const view = await (await api(page, "GET", `/bookings/${booking.id}`, "u_patient_demo")).json();
  expect(view.data.status).toBe("Completed");
  await api(page, "PUT", "/admin/demo", ADMIN, { demoMode: true, simulateDispatch: true, acceptDelaySec: 8, stepDelaySec: 6 });
});
