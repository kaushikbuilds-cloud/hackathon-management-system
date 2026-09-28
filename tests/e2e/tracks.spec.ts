import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, registerTeam, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const teamName = `Track Stars ${run}`;

test.afterAll(async () => {
  // Leave the shared demo hackathon without tracks for the other specs.
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  await pool.query("update hackathons set tracks = '{}' where id = (select hackathon_id from profiles where email = $1)", [creds.admin.email]);
  await pool.end();
});

test("the Admin lists tracks in Event Setup", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/event");
  await page.getByLabel("Tracks (optional)").fill("AI/ML\nWeb Development\nIoT\nweb development");
  await page.getByRole("button", { name: "Save event settings" }).click();
  await expect(page.getByText("Event settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Tracks (optional)")).toHaveValue("AI/ML\nWeb Development\nIoT"); // duplicates dropped
});

test("a team must pick a track when it registers", async ({ page }) => {
  await registerTeam(page, teamName, [["Track Leader", `track1.${run}@e2e.test`], ["Track Member", `track2.${run}@e2e.test`]], { track: "IoT" });
});

test("staff see tracks on the Teams page, the dashboard and the team page", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/teams?track=IoT");
  const row = page.getByRole("row").filter({ hasText: teamName });
  await expect(row).toContainText("IoT");

  await page.goto("/staff");
  const dist = page.locator("section").filter({ has: page.getByRole("heading", { name: "Team distribution" }) });
  await expect(dist).toContainText("IoT");
  await expect(dist).toContainText("AI/ML");

  await page.goto("/staff/teams?track=IoT");
  await row.getByRole("link", { name: teamName, exact: true }).first().click();
  await expect(page.getByText("Track", { exact: true }).first()).toBeVisible();
  await page.getByText("Correct team details").click();
  await page.getByLabel(/^Track/).selectOption("Web Development");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.getByText("Team details updated.")).toBeVisible();
  await page.goto("/staff/teams?track=Web+Development");
  await expect(page.getByRole("row").filter({ hasText: teamName })).toBeVisible();
});
