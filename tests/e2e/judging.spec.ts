import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, registerTeam, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !creds.official.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD, E2E_OFFICIAL_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const teamName = `Judged Team ${run}`;
const db = () => new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
const HACKATHON = "(select hackathon_id from profiles where email = $1)";

test.beforeAll(async () => {
  const pool = db();
  // A clean slate, and the demo Official becomes a judge for this spec.
  await pool.query(`delete from judging_criteria where hackathon_id = ${HACKATHON}`, [creds.admin.email]);
  await pool.query(`update hackathons set judging_open = false where id = ${HACKATHON}`, [creds.admin.email]);
  await pool.query("insert into staff_permissions (profile_id, permission) select id, 'judge_teams' from profiles where email = $1 on conflict do nothing", [creds.official.email]);
  await pool.end();
});

test.afterAll(async () => {
  const pool = db();
  await pool.query(`delete from judging_criteria where hackathon_id = ${HACKATHON}`, [creds.admin.email]);
  await pool.query(`update hackathons set judging_open = false where id = ${HACKATHON}`, [creds.admin.email]);
  await pool.query("delete from staff_permissions where permission = 'judge_teams' and profile_id = (select id from profiles where email = $1)", [creds.official.email]);
  await pool.query("update teams set award = null where name = $1", [teamName]);
  await pool.end();
});

test("the Admin sets criteria and opens judging", async ({ page }) => {
  await registerTeam(page, teamName, [["Judged Lead", `judged1.${run}@e2e.test`], ["Judged Two", `judged2.${run}@e2e.test`]]);
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/judging/results");
  await expect(page.getByRole("button", { name: "Open judging" })).toBeDisabled(); // needs criteria first
  for (const [name, max] of [["Idea", "10"], ["Demo", "5"]]) {
    const add = page.locator("details").filter({ has: page.getByText("Add a criterion") });
    if (!(await add.getAttribute("open") !== null)) await add.getByText("Add a criterion").click();
    await page.getByLabel("Name", { exact: false }).last().fill(name);
    await page.getByLabel(/^Maximum points/).last().fill(max);
    await page.getByRole("button", { name: "Add criterion" }).click();
    await expect(page.getByText("Criterion added.")).toBeVisible();
  }
  await page.getByRole("button", { name: "Open judging" }).click();
  await expect(page.getByText("Judging is open. Judges can score teams now.")).toBeVisible();
});

test("a judge scores a team; other judges' scores stay hidden", async ({ page }) => {
  await signIn(page, creds.official.email, creds.official.password);
  await page.goto("/staff/judging");
  await page.getByLabel("Search teams").fill(teamName);
  await page.getByRole("button", { name: "Show" }).click();
  await page.getByRole("link", { name: new RegExp(teamName) }).click();
  await page.getByLabel("Idea: 8").check({ force: true });
  await page.getByLabel("Demo: 4").check({ force: true });
  await page.getByLabel(/^Comment/).fill("Strong demo");
  await page.getByRole("button", { name: "Save score" }).click();
  await expect(page.getByText("Score saved (12 points).")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(teamName) })).toContainText("12 / 15");
  // Judges cannot open the results.
  await page.goto("/staff/judging/results");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

test("the Admin sees the leaderboard, gives an award and closes judging", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/judging/results");
  const row = page.getByRole("row").filter({ hasText: teamName });
  await expect(row).toContainText("12 / 15");
  await row.getByLabel(`Award for ${teamName}`).fill("Winner");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Award saved: Winner.")).toBeVisible();
  const csv = await page.request.get("/api/reports/judging");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(`${teamName},`);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Close judging" }).click();
  await expect(page.getByText("Judging is closed. Scores are locked.")).toBeVisible();
  // The award is the one certificates use (the team gets a certificate of achievement).
  const pool = db();
  expect((await pool.query("select award from teams where name = $1", [teamName])).rows[0].award).toBe("Winner");
  await pool.end();
});
