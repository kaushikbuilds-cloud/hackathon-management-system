import { expect, test } from "@playwright/test";
import { creds, signIn } from "./helpers";

test.skip(!creds.superAdmin.password || !creds.admin.password, "Set E2E_SUPER_ADMIN_PASSWORD and E2E_ADMIN_PASSWORD (see README).");

test("the owner sees monthly totals and downloads the CSV; Admins cannot", async ({ page }) => {
  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await page.getByRole("link", { name: "Monthly Reports" }).click();
  await expect(page.getByRole("heading", { name: "Monthly Reports" })).toBeVisible();
  await expect(page.getByText("Teams registered").first()).toBeVisible();
  await expect(page.getByRole("table", { name: /Monthly totals/ })).toBeVisible();

  const csv = await page.request.get("/api/platform/monthly-report");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).split("\n")[0]).toContain("Teams registered");

  await page.goto("/staff/monthly-reports?month=2099-01"); // future months fall back to this month
  await expect(page.getByRole("heading", { level: 2 }).first()).not.toContainText("2099");

  await page.context().clearCookies();
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/monthly-reports");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  expect((await page.request.get("/api/platform/monthly-report")).status()).toBe(403);
});
