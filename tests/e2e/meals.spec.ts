import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, registerTeam, signIn, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const meal = `Lunch ${run}`;
const email = `meal.${run}@e2e.test`;
let mealUrl = "";

async function member(memberEmail: string): Promise<{ qr_token: string; participant_code: string }> {
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  try {
    return (await pool.query("select qr_token, participant_code from participants where lower(email) = lower($1)", [memberEmail])).rows[0];
  } finally {
    await pool.end();
  }
}

test("the counter scans cards for a meal and blocks second servings", async ({ page }) => {
  await registerTeam(page, `Meal Team ${run}`, [["Nila Eater", email], ["Arun Eater", `meal2.${run}@e2e.test`]]);
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/food/meals");
  await page.getByLabel("Meal name").last().fill(meal);
  await page.getByRole("button", { name: "Add meal" }).click();
  await expect(page.getByText("Meal added.")).toBeVisible();
  await page.getByRole("link", { name: meal, exact: true }).click();
  await page.waitForURL(/\/staff\/food\/meals\/[0-9a-f-]{36}/);
  mealUrl = page.url();
  await expect(page.getByText("Start serving to scan cards for this meal.")).toBeVisible();
  await page.getByRole("button", { name: "Start serving" }).click();
  await expect(page.getByText("Serving started")).toBeVisible();

  // A handheld scanner types the card's verify URL into the code box.
  const url = `http://localhost:3000/verify/${(await member(email)).qr_token}`;
  await page.getByLabel("Scanned code").fill(url);
  await page.getByRole("button", { name: "Serve", exact: true }).click();
  await expect(page.getByText("Served ✓")).toBeVisible();
  await expect(page.getByText("Nila Eater").first()).toBeVisible();

  await page.getByLabel("Scanned code").fill(url);
  await page.getByRole("button", { name: "Serve", exact: true }).click();
  await expect(page.getByText(`Already had ${meal}`)).toBeVisible();
  await expect(page.getByText("Do not serve again.")).toBeVisible();

  // No card: find by name.
  const arun = (await member(`meal2.${run}@e2e.test`)).participant_code;
  await page.getByLabel("No card? Find by name or Participant ID").fill(arun);
  await page.getByRole("listitem").filter({ hasText: arun }).getByRole("button", { name: "Serve" }).click();
  await expect(page.getByText("Served ✓")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("table", { name: `Served for ${meal}` })).toContainText("Arun Eater");
  await expect(page.getByRole("table", { name: `Served for ${meal}` })).toContainText("Name search");

  const csv = await page.request.get(`${mealUrl.replace("/staff/food/meals/", "/api/meals/")}/csv`);
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("Nila Eater");
  expect(text).toMatch(/Nila Eater,[^\n]*,Served,/);
});

test("the team sees which members have eaten", async ({ page }) => {
  const { teamCode, code } = await teamCredentials(email);
  const password = `Meal-${run}-Pass1!`;
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(code);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await page.waitForURL(/\/portal/);
  await page.goto("/portal/food");
  const row = page.getByRole("table", { name: "Meals served to your team" }).getByRole("row").filter({ hasText: meal });
  await expect(row.getByText("✓ Had it")).toHaveCount(2);
});

test("stopping the meal stops serving", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto(mealUrl);
  await page.getByRole("button", { name: "Stop serving" }).click();
  await expect(page.getByText("Serving closed.")).toBeVisible();
  await expect(page.getByText("Start serving to scan cards for this meal.")).toBeVisible();
});
