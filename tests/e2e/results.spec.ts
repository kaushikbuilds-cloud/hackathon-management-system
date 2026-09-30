import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, registerTeam, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const teamName = `Champions ${run}`;
const db = () => new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
const HACKATHON = "(select hackathon_id from profiles where email = $1)";
let slug = "";

test.beforeAll(async () => {
  const pool = db();
  slug = (await pool.query(`select slug from hackathons where id = ${HACKATHON}`, [creds.admin.email])).rows[0].slug;
  await pool.query(`update hackathons set results_published = false, results_published_at = null where id = ${HACKATHON}`, [creds.admin.email]);
  await pool.end();
});

test.afterAll(async () => {
  const pool = db();
  await pool.query(`update hackathons set results_published = false, results_published_at = null where id = ${HACKATHON}`, [creds.admin.email]);
  await pool.query("update teams set award = null where name = $1", [teamName]);
  await pool.query("delete from notifications where title = 'Results are out'");
  await pool.end();
});

test("results stay hidden until the Admin publishes them", async ({ page }) => {
  await registerTeam(page, teamName, [["Champ Lead", `champ1.${run}@e2e.test`], ["Champ Two", `champ2.${run}@e2e.test`]]);
  const pool = db();
  await pool.query("update teams set status = 'approved' where name = $1", [teamName]);
  await pool.end();
  await page.goto(`/h/${slug}/results`);
  await expect(page.getByText("The results haven't been announced yet")).toBeVisible();
  await page.goto(`/h/${slug}`);
  await expect(page.getByRole("link", { name: "See results" })).toHaveCount(0);
});

test("the Admin gives an award and publishes; the public sees the winner", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/judging/results");
  const row = page.getByRole("row").filter({ hasText: teamName });
  await row.getByLabel(`Award for ${teamName}`).fill("Winner");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Award saved: Winner.")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish results" }).click();
  await expect(page.getByText("Results are public and teams were notified.")).toBeVisible();

  await page.goto(`/h/${slug}`);
  await page.getByRole("link", { name: "See results" }).click();
  await expect(page).toHaveURL(new RegExp(`/h/${slug}/results$`));
  const card = page.getByRole("listitem").filter({ hasText: teamName });
  await expect(card).toContainText("Winner");
  await expect(card).toContainText("Champ Lead");
  await expect(card).not.toContainText("@e2e.test");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} — ${v.help}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  const pool = db();
  const { rows } = await pool.query("select count(*)::int as n from notifications n join teams t on t.id = n.team_id where t.name = $1 and n.title = 'Results are out'", [teamName]);
  await pool.end();
  expect(rows[0].n).toBe(1);
});

test("hiding the results takes them off the public page", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/judging/results");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Hide results" }).click();
  await expect(page.getByText("Results are hidden from the public page.")).toBeVisible();
  await page.goto(`/h/${slug}/results`);
  await expect(page.getByText("The results haven't been announced yet")).toBeVisible();
});
