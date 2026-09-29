import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, registerTeam, signIn, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const limited = `Smart waste ${run}`;
const open = `Clean water ${run}`;
const teamName = `Solvers ${run}`;
const otherTeam = `Rivals ${run}`;
const password = `Solver-${run}-Pass1!`;
let teamLogin = "";
const db = () => new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
const HACKATHON = "(select hackathon_id from profiles where email = $1)";

test.afterAll(async () => {
  const pool = db();
  await pool.query(`delete from problem_statements where hackathon_id = ${HACKATHON} and title like $2`, [creds.admin.email, `%${run}`]);
  await pool.query(`update hackathons set ps_selection_open = false where id = ${HACKATHON}`, [creds.admin.email]);
  await pool.end();
});

test("the Admin publishes problem statements and opens selection", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/problem-statements");
  for (const [title, max] of [[limited, "1"], [open, ""]]) {
    await page.getByLabel(/^Title/).last().fill(title);
    await page.getByLabel(/^Description/).last().fill(`Solve ${title}.`);
    await page.getByLabel(/^Team limit/).last().fill(max);
    await page.getByRole("button", { name: "Add problem statement" }).click();
    await expect(page.getByText(/PS\d+ added\./)).toBeVisible();
  }
  await page.getByRole("button", { name: "Open selection" }).click();
  await expect(page.getByText("Teams can now choose a problem statement.")).toBeVisible();

  // Published statements are on the public event page.
  const { rows: [h] } = await (async () => { const p = db(); const r = await p.query(`select slug from hackathons where id = ${HACKATHON}`, [creds.admin.email]); await p.end(); return r; })();
  await page.goto(`/h/${h.slug}`);
  await expect(page.getByRole("heading", { name: "Problem statements" })).toBeVisible();
  await expect(page.getByText(limited).first()).toBeVisible();
});

test("a team picks the limited statement; it is then full for other teams", async ({ page }) => {
  await registerTeam(page, otherTeam, [["Rival Lead", `rival1.${run}@e2e.test`], ["Rival Two", `rival2.${run}@e2e.test`]]);
  await registerTeam(page, teamName, [["Solver Lead", `solver1.${run}@e2e.test`], ["Solver Two", `solver2.${run}@e2e.test`]]);
  const { teamCode, code } = await teamCredentials(`solver1.${run}@e2e.test`);
  teamLogin = teamCode;
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(code);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await page.waitForURL(/\/portal/);

  await page.goto("/portal/problem-statement");
  const card = page.getByRole("listitem").filter({ hasText: limited });
  await expect(card).toContainText("1 of 1 place left");
  await card.getByRole("button", { name: "Choose this" }).click();
  await expect(page.getByText("Problem statement chosen. You can change it while selection is open.")).toBeVisible();
  await expect(page.getByText(new RegExp(`Your team chose PS\\d+: ${limited}`))).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: limited })).toContainText("Your choice");

  // The rival team sees it as full (checked in the database rule too).
  const pool = db();
  const { rows: [ps] } = await pool.query("select id from problem_statements where title = $1", [limited]);
  const { rows: [rival] } = await pool.query("select id from teams where name = $1", [otherTeam]);
  await pool.end();
  const other = await page.context().browser()!.newPage();
  const rivalCreds = await teamCredentials(`rival1.${run}@e2e.test`);
  await other.goto("/activate");
  await other.getByLabel("Team ID").fill(rivalCreds.teamCode);
  await other.getByLabel("Activation code").fill(rivalCreds.code);
  await other.getByLabel("New password").fill(password);
  await other.getByLabel("Confirm password").fill(password);
  await other.getByRole("button", { name: "Activate account" }).click();
  await other.waitForURL(/\/portal/);
  await other.goto("/portal/problem-statement");
  const full = other.getByRole("listitem").filter({ hasText: limited });
  await expect(full).toContainText("Full");
  await expect(full.getByRole("button", { name: "Choose this" })).toBeDisabled();
  await other.close();
  expect(ps.id).toBeTruthy();
  expect(rival.id).toBeTruthy();
});

test("staff filter teams by problem statement; after closing, the choice is final", async ({ page, browser }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  const pool = db();
  const { rows: [ps] } = await pool.query("select id, code from problem_statements where title = $1", [limited]);
  await pool.end();
  await page.goto(`/staff/teams?ps=${ps.id}`);
  const row = page.getByRole("row").filter({ hasText: teamName });
  await expect(row).toContainText(ps.code);
  await expect(page.getByRole("row").filter({ hasText: otherTeam })).toHaveCount(0);
  await row.getByRole("link", { name: teamName, exact: true }).first().click();
  await expect(page.getByText(`${ps.code} · ${limited}`).first()).toBeVisible();

  await page.goto("/staff/problem-statements");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Close selection" }).click();
  await expect(page.getByText("Selection is closed. Teams' choices are locked.")).toBeVisible();

  const team = await browser.newPage();
  await signIn(team, teamLogin, password);
  await team.goto("/portal/problem-statement");
  await expect(team.getByText("Selection is closed, so your choice is final.")).toBeVisible();
  await expect(team.getByRole("button", { name: /Choose this|Switch to this|Clear choice/ })).toHaveCount(0);
  await team.close();
});
