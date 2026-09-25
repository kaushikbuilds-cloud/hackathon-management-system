import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { FORM_SLUG, creds, signIn } from "./helpers";

// Reads the printed code straight from the database (the PDF text is glyph-encoded).
const dbUrl = process.env.E2E_DATABASE_URL;

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !dbUrl, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

let TEAM = ""; // Team ID of a team without a login yet
let TEAM_UUID = "";
let MEMBER = ""; // one of its Participant IDs
const password = `Kabir-${Date.now().toString(36)}-Pass1!`;
const newPassword = `Kabir-${Date.now().toString(36)}-New2!`;
let code = "";

async function query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    return (await pool.query(sql, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

async function activate(page: Page, teamId: string, withCode: string, pass: string) {
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamId);
  await page.getByLabel("Activation code").fill(withCode);
  await page.getByLabel("New password").fill(pass);
  await page.getByLabel("Confirm password").fill(pass);
  await page.getByRole("button", { name: "Activate account" }).click();
}

const run = Date.now().toString(36);

test("printing a team's cards issues one login code for the whole team", async ({ page }) => {
  // A fresh team of our own.
  await page.goto(`/register/${FORM_SLUG}`);
  await page.getByLabel("Team name").fill(`Login Testers ${run}`);
  await page.getByLabel("College / institution").fill("Login College");
  const phoneBase = String(Date.now()).slice(-7);
  for (const i of [0, 1]) {
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^Member ${i + 1}`) }) });
    await card.getByLabel("Full name").fill(["Kabir Login", "Meera Login"][i]);
    await card.getByLabel("Email").fill(`login${i}.${run}@e2e.test`);
    await card.getByLabel("Phone number").fill(`+91 6${phoneBase}${i}${run.length % 10}`);
    await card.getByLabel("Department").fill("IT");
    await card.getByLabel("Academic year").fill("2nd Year");
  }
  const track = page.getByLabel(/Which track/);
  if (await track.count()) await track.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByText("Registration received!")).toBeVisible();

  await signIn(page, creds.admin.email, creds.admin.password);
  const [team] = await query<{ id: string; team_code: string; participant_code: string }>(
    `select t.id, t.team_code, min(p.participant_code) as participant_code from teams t join participants p on p.team_id = t.id
      where t.name = $1 group by t.id`, [`Login Testers ${run}`]);
  TEAM = team.team_code;
  TEAM_UUID = team.id;
  MEMBER = team.participant_code;
  const res = await page.request.get(`/api/teams/${team.id}/id-cards/preview`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const [row] = await query<{ code: string; used_at: string | null }>("select code, used_at from team_activation_codes where team_id = $1", [team.id]);
  expect(row.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
  expect(row.used_at).toBeNull();
  code = row.code;
  // Reprinting keeps the same code.
  await page.request.get(`/api/teams/${team.id}/id-cards/preview`);
  expect((await query<{ code: string }>("select code from team_activation_codes where team_id = $1", [team.id]))[0].code).toBe(code);
});

test("a Participant ID or wrong code is refused; the Team ID and code activate the team login", async ({ page }) => {
  await activate(page, MEMBER.replace(/-P(\d+)$/, (_, n: string) => `-p${n.replace(/0/g, "o")}`), code, password);
  await expect(page.getByText(`${MEMBER} is a Participant ID. Your team signs in with its Team ID`)).toBeVisible();

  await activate(page, TEAM, code === "ABCDEFGH" ? "HGFEDCBA" : "ABCDEFGH", password);
  await expect(page.getByText("do not match")).toBeVisible();

  await activate(page, TEAM, `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`, password);
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.getByText("Team dashboard")).toBeVisible();
});

test("the code is single use and every member signs in with the Team ID", async ({ page }) => {
  await activate(page, TEAM, code, password);
  await expect(page.getByText("Your team has already activated its login")).toBeVisible();

  await signIn(page, TEAM.toLowerCase(), password);
  await expect(page).toHaveURL(/\/portal/);
  await page.goto("/portal/profile");
  await expect(page.getByText(TEAM, { exact: true })).toBeVisible();
  await expect(page.getByText("Email (sign-in)")).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email or Team ID").fill(MEMBER);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Your team signs in with its Team ID")).toBeVisible();
});

test("a team that forgot its password gets a new code from the organisers", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto(`/staff/teams/${TEAM_UUID}`);
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Team login", exact: true }) }).last();
  await expect(card).toContainText("Active");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Forgot password: new code" }).click();
  await expect(page.getByText("New team login code created.")).toBeVisible();
  const [row] = await query<{ code: string; used_at: string | null }>("select code, used_at from team_activation_codes where team_id = $1", [TEAM_UUID]);
  expect(row.code).not.toBe(code);
  expect(row.used_at).toBeNull();

  await page.context().clearCookies();
  await activate(page, TEAM, code, newPassword); // the old code is gone
  await expect(page.getByText("do not match")).toBeVisible();
  await activate(page, TEAM, row.code, newPassword);
  await expect(page).toHaveURL(/\/portal/);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email or Team ID").fill(TEAM);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid Team ID or password.")).toBeVisible();
  await signIn(page, TEAM, newPassword);
  await expect(page).toHaveURL(/\/portal/);
});
