import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, signIn, signOut } from "./helpers";

/**
 * Self-serve sign-up without Razorpay API keys: the organiser pays on a
 * Payment Page link and the Super Admin approves the payment. Runs only when
 * the app was started WITHOUT RAZORPAY_KEY_ID (set E2E_PAYMENT_LINK_MODE=1).
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_PAYMENT_LINK_MODE !== "1" || !process.env.E2E_DATABASE_URL || !creds.superAdmin.password, "Set E2E_PAYMENT_LINK_MODE=1 and start the app without Razorpay keys.");

const run = Date.now().toString(36);
const email = `linkpay.${run}@e2e.test`;
const password = `Organiser-${run}-Pass1!`;
const hackName = `Link Pay Hack ${run}`;
const paymentId = `pay_${run.padEnd(14, "x").slice(0, 14)}`;

test.afterAll(async () => {
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  await pool.query("delete from hackathons where name = $1", [hackName]);
  await pool.query("update platform_settings set payment_link = null");
  await pool.end();
});

test("Super Admin saves the Payment Page link", async ({ page }) => {
  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await page.goto("/staff/payments");
  await page.getByLabel("Razorpay Payment Page link").fill("https://rzp.io/rzp/hackground-test");
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(page.getByText("Payment link saved.")).toBeVisible();
});

test("an organiser pays on the link and sends the payment ID", async ({ page }) => {
  await page.goto("/start");
  await page.getByLabel("Your name").fill("Lina Link");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel(/College, club or company/).fill("Lakeside College");
  await page.getByLabel(/Hackathon name/).fill(hackName);
  await page.getByLabel(/I agree to pay/).check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/\/start\/pay$/);
  await expect(page.getByRole("link", { name: "Pay ₹299" })).toHaveAttribute("href", "https://rzp.io/rzp/hackground-test");
  await page.getByLabel("Payment ID").fill("not-an-id");
  await page.getByRole("button", { name: "I've paid" }).click();
  await expect(page).toHaveURL(/error=/);
  await expect(page.getByRole("alert").filter({ hasText: /pay_ followed by/ })).toBeVisible();
  await page.getByLabel("Payment ID").fill(paymentId);
  await page.getByRole("button", { name: "I've paid" }).click();
  await expect(page.getByText("We've received your payment ID")).toBeVisible();
  await expect(page.getByText("Payment received, being checked")).toBeVisible();
});

test("the Super Admin approves and the organiser gets their hackathon", async ({ page }) => {
  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await page.goto("/staff/payments");
  const item = page.getByRole("listitem").filter({ hasText: paymentId });
  await expect(item).toContainText(hackName);
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved. The organiser's hackathon is ready.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: hackName })).toContainText("Paid");
  await signOut(page);
  await signIn(page, email, password);
  await page.goto("/staff/event");
  await expect(page.getByRole("heading", { name: /Event Setup/ })).toBeVisible();
});
