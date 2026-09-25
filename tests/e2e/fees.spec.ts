import { expect, test, type Page } from "@playwright/test";
import { creds, signIn, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const slug = `fee-${run}`;
const teamName = `Fee Payers ${run}`;
const phoneBase = String(Date.now()).slice(-7);
const utr1 = `UTR${Date.now()}`.slice(0, 16);
const utr2 = `${utr1}B`;
// Smallest valid PNG (the server checks the real file type, not the extension).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
let teamUrl = "";
let leaderPid = "";
let leaderCode = "";

async function member(page: Page, i: number, name: string, email: string) {
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^Member ${i + 1}`) }) });
  await card.getByLabel("Full name").fill(name);
  await card.getByLabel("Email").fill(email);
  await card.getByLabel("Phone number").fill(`+91 8${phoneBase}${i}${run.length % 10}`);
  await card.getByLabel("Department").fill("CSE");
  await card.getByLabel("Academic year").fill("2nd Year");
}

test("the host turns on a per-member UPI fee for a form", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/forms/new");
  await page.getByLabel("Title").fill(`Fee form ${run}`);
  await page.getByLabel("URL slug").fill(slug);
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByLabel("Minimum team size").fill("2");
  await page.getByLabel("Collect a registration fee").check();
  await page.getByLabel("Fee amount (₹)").fill("200");
  await page.getByLabel("Charged").selectOption("member");
  await page.getByLabel("UPI ID").fill("techclub@okaxis");
  await page.getByLabel("Payee name").fill("Tech Club");
  await page.getByRole("button", { name: "Save form" }).click();
  await expect(page.getByText("Form saved.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Form published")).toBeVisible();
});

test("teams see the amount and UPI QR, and must submit proof to register", async ({ page }) => {
  await page.goto(`/register/${slug}`);
  await expect(page.getByText("₹400")).toBeVisible(); // ₹200 × 2 members
  await expect(page.getByRole("img", { name: /UPI QR code to pay ₹400 to techclub@okaxis/ })).toBeVisible();
  await page.getByLabel("Team name").fill(teamName);
  await page.getByLabel("College / institution").fill("Fee College");
  await member(page, 0, "Lead Payer", `lead.${run}@e2e.test`);
  await member(page, 1, "Second Payer", `second.${run}@e2e.test`);
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByText("Please check the payment details.")).toBeVisible();

  await page.getByLabel("UPI transaction ID (UTR)").fill(utr1);
  await page.setInputFiles("#payment_proof", { name: "paid.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByText("Payment of ₹400 submitted")).toBeVisible();
  ({ teamCode: leaderPid, code: leaderCode } = await teamCredentials(`lead.${run}@e2e.test`));
});

test("the same UPI transaction cannot pay for a second team", async ({ page }) => {
  await page.goto(`/register/${slug}`);
  await page.getByLabel("Team name").fill(`Copycats ${run}`);
  await page.getByLabel("College / institution").fill("Fee College");
  await member(page, 0, "Copy One", `copy1.${run}@e2e.test`);
  await member(page, 1, "Copy Two", `copy2.${run}@e2e.test`);
  await page.getByLabel("UPI transaction ID (UTR)").fill(utr1.toLowerCase());
  await page.setInputFiles("#payment_proof", { name: "paid.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByText("This transaction ID was already used for another team.")).toBeVisible();
});

test("staff see the payment to verify and reject it with a reason", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/teams?payment=submitted");
  const link = page.getByRole("link", { name: teamName, exact: true }).first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/staff\/teams\/[0-9a-f-]{36}$/);
  teamUrl = new URL(page.url()).pathname;
  await expect(page.getByText(utr1)).toBeVisible();
  const proof = await page.request.get(`${teamUrl.replace("/staff/teams", "/api/teams")}/payment-proof`, { maxRedirects: 0 });
  expect([302, 307]).toContain(proof.status());
  await page.getByLabel("Note to the team").fill("Only ₹200 received, please pay the balance");
  await page.getByRole("button", { name: "Reject payment" }).click();
  await expect(page.getByText("Payment rejected. The team was notified")).toBeVisible();
});

test("the Team Leader resubmits and staff mark it paid", async ({ page }) => {
  const password = `Payer-${run}-Pass1!`;
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(leaderPid);
  await page.getByLabel("Activation code").fill(leaderCode);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByText("Your payment was not accepted")).toBeVisible();
  await expect(page.getByText("Only ₹200 received")).toBeVisible();
  await page.getByLabel("UPI transaction ID (UTR)").fill(utr2);
  await page.setInputFiles("#payment_proof", { name: "paid2.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Resubmit" }).click();
  await expect(page.getByText("Payment proof submitted")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto(teamUrl);
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await expect(page.getByText("Payment verified.")).toBeVisible();
  await page.goto("/staff/teams?payment=verified");
  await expect(page.getByRole("link", { name: teamName, exact: true }).first()).toBeVisible();
});
