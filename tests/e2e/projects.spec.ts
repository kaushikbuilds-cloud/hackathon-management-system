import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, registerTeam, signIn, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const teamName = `Builders ${run}`;
const leaderEmail = `builder1.${run}@e2e.test`;
const password = `Builder-${run}-Pass1!`;
const REPO = `https://github.com/builders-${run}/smart-bins`;
let teamLogin = "";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

test.afterAll(async () => {
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  await pool.query("update hackathons set projects_open = false, projects_deadline = null where id = (select hackathon_id from profiles where email = $1)", [creds.admin.email]);
  await pool.end();
});

test("the Admin opens project submissions with a deadline", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/projects");
  await page.getByLabel("Accept project submissions").check();
  const tomorrow = new Date(Date.now() + 36 * 3600_000);
  const local = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T18:00`;
  await page.getByLabel("Deadline (optional)").fill(local);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Project submissions are open.")).toBeVisible();
});

test("a team submits its GitHub project with slides", async ({ page }) => {
  await registerTeam(page, teamName, [["Builder Lead", leaderEmail], ["Builder Two", `builder2.${run}@e2e.test`]]);
  const { teamCode, code } = await teamCredentials(leaderEmail);
  teamLogin = teamCode;
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(code);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await page.waitForURL(/\/portal/);

  await expect(page.getByText("Submit your project")).toBeVisible();
  await page.getByRole("link", { name: "Submit project" }).click();
  await page.getByLabel(/^Project name/).fill("Smart Bins");
  await page.getByLabel(/^What does it do/).fill("Bins that tell the council when they are full, so trucks skip empty streets.");
  await page.getByLabel(/^GitHub \/ GitLab repository/).fill("https://example.com/not-a-repo");
  await page.getByRole("button", { name: "Submit project" }).click();
  await expect(page.getByText(/Paste the project link/)).toBeVisible();

  await page.getByLabel(/^GitHub \/ GitLab repository/).fill(REPO);
  await page.getByLabel(/^Live demo link/).fill("https://bins.example.com");
  await page.getByLabel(/^Slides/).setInputFiles({ name: "deck.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Submit project" }).click();
  await expect(page.getByText("Project submitted. You can edit it until the deadline.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Update project" })).toBeVisible();
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  const { rows: [t] } = await pool.query("select id from teams where name = $1", [teamName]);
  await pool.end();
  const slides = await page.request.get(`/api/projects/${t.id}/slides`);
  expect(slides.status()).toBe(200);
  expect((await slides.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("staff see the project; after closing, the team's project is read-only", async ({ page, browser }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto(`/staff/projects?show=submitted&q=${encodeURIComponent(teamName)}`);
  const row = page.getByRole("row").filter({ hasText: teamName });
  await expect(row).toContainText("Smart Bins");
  await expect(row.getByRole("link", { name: "Code" })).toHaveAttribute("href", REPO);
  await expect(row.getByRole("link", { name: "Slides" })).toBeVisible();
  const csv = await page.request.get("/api/reports/projects");
  expect(await csv.text()).toContain(REPO);

  await page.getByLabel("Accept project submissions").uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Project submissions are closed.")).toBeVisible();

  const team = await browser.newPage();
  await signIn(team, teamLogin, password);
  await team.goto("/portal/project");
  await expect(team.getByText("Your project is saved; it can no longer be changed.")).toBeVisible();
  await expect(team.getByRole("button", { name: /project/i })).toHaveCount(0);
  await expect(team.getByRole("link", { name: /builders-.*smart-bins/ })).toBeVisible();
  await team.close();
});
