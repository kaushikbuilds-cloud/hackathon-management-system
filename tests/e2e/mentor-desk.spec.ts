import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, registerTeam, signIn, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !creds.official.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD, E2E_OFFICIAL_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const teamName = `Stuck Team ${run}`;
const password = `Stuck-${run}-Pass1!`;
let teamLogin = "";
const db = () => new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
const HACKATHON = "(select hackathon_id from profiles where email = $1)";

test.beforeAll(async () => {
  const pool = db();
  // The demo Official becomes a mentor for this spec.
  await pool.query("insert into staff_permissions (profile_id, permission) select id, 'mentor_teams' from profiles where email = $1 on conflict do nothing", [creds.official.email]);
  await pool.query(`update hackathons set mentor_desk_open = false where id = ${HACKATHON}`, [creds.admin.email]);
  await pool.end();
});

test.afterAll(async () => {
  const pool = db();
  await pool.query(`update hackathons set mentor_desk_open = false where id = ${HACKATHON}`, [creds.admin.email]);
  await pool.query("delete from staff_permissions where permission = 'mentor_teams' and profile_id = (select id from profiles where email = $1)", [creds.official.email]);
  await pool.end();
});

test("the Admin opens the mentor desk", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/mentors");
  await expect(page.getByText("The mentor desk is closed")).toBeVisible();
  await page.getByRole("button", { name: "Open desk" }).click();
  await expect(page.getByText("The mentor desk is open. Teams can ask for help.")).toBeVisible();
});

test("a team asks for a mentor and sees its place in the queue", async ({ page }) => {
  await registerTeam(page, teamName, [["Stuck Lead", `stuck1.${run}@e2e.test`], ["Stuck Two", `stuck2.${run}@e2e.test`]]);
  const pool = db();
  await pool.query("update teams set status = 'approved' where name = $1", [teamName]);
  await pool.end();
  const { teamCode, code } = await teamCredentials(`stuck1.${run}@e2e.test`);
  teamLogin = teamCode;
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(code);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await page.waitForURL(/\/portal/);

  await page.goto("/portal/mentor");
  await page.getByLabel(/What do you need help with/).selectOption("Backend");
  await page.getByLabel(/What's the problem/).fill(`Our API crashes on login ${run}`);
  await page.getByLabel(/Where is your team sitting/).fill("Lab 2, table 14");
  await page.getByRole("button", { name: "Ask for a mentor" }).click();
  await expect(page.getByText("Request sent. A mentor will come to you soon.")).toBeVisible();
  await expect(page.getByText(/ahead of you|You're next in the queue/)).toBeVisible();
  // One open request at a time: the form is gone.
  await expect(page.getByRole("button", { name: "Ask for a mentor" })).toHaveCount(0);
});

test("a mentor takes the request; the team sees who is coming; the mentor marks it done", async ({ page, browser }) => {
  await signIn(page, creds.official.email, creds.official.password);
  await page.goto("/staff/mentors");
  const item = page.getByRole("listitem").filter({ hasText: `Our API crashes on login ${run}` });
  await expect(item).toContainText(teamName);
  await expect(item).toContainText("Lab 2, table 14");
  await item.getByRole("button", { name: "I'm on it" }).click();
  await expect(page.getByText("It's yours. The team has been told you're on the way.")).toBeVisible();
  const mine = page.locator("section", { has: page.getByRole("heading", { name: "You're helping" }) });
  await expect(mine).toContainText(teamName);

  const team = await browser.newPage();
  await signIn(team, teamLogin, password);
  await team.goto("/portal/mentor");
  await expect(team.getByRole("heading", { name: /is coming to help/ })).toBeVisible();
  await team.goto("/portal/notifications");
  await expect(team.getByText("A mentor is on the way").first()).toBeVisible();

  await mine.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Marked as done. Thanks for helping!")).toBeVisible();
  await expect(page.getByText("Recently helped")).toBeVisible();

  await team.goto("/portal/mentor");
  await expect(team.getByRole("listitem").filter({ hasText: `Our API crashes on login ${run}` })).toContainText("Done");
  await expect(team.getByRole("button", { name: "Ask for a mentor" })).toBeVisible();
  await team.close();
});
