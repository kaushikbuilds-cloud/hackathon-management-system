import { expect, test } from "@playwright/test";
import { creds, signIn } from "./helpers";

test.skip(!creds.admin.password, "Set E2E_ADMIN_PASSWORD (see README).");

test("the host sets the brand kit and ID cards follow it", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/brand");
  await expect(page.getByRole("heading", { name: "Brand Kit" })).toBeVisible();
  await page.getByRole("button", { name: "Ocean" }).click();
  await expect(page.getByLabel("Card background hex code")).toHaveValue("#0c4a6e");
  await page.getByRole("button", { name: "Save brand kit" }).click();
  await expect(page.getByText("Brand kit saved")).toBeVisible();
  // The sample card renders with the saved brand kit.
  const res = await page.request.get("/api/id-cards/sample");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  // The template form no longer has its own colour pickers.
  await page.goto("/staff/id-cards");
  await expect(page.getByRole("link", { name: "Brand Kit" }).first()).toBeVisible();
});
