import { expect, type Page } from "@playwright/test";

export const creds = {
  superAdmin: { email: process.env.E2E_SUPER_ADMIN_EMAIL ?? "superadmin@example.com", password: process.env.E2E_SUPER_ADMIN_PASSWORD ?? "" },
  admin: { email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com", password: process.env.E2E_ADMIN_PASSWORD ?? "" },
  official: { email: process.env.E2E_OFFICIAL_EMAIL ?? "official@example.com", password: process.env.E2E_OFFICIAL_PASSWORD ?? "" },
};

export const FORM_SLUG = process.env.E2E_FORM_SLUG ?? "buildfest-2026";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** Super Admin: open a hackathon (platform → event context). */
export async function openHackathon(page: Page, name: string | RegExp) {
  await page.goto("/staff/hackathons");
  await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("as the platform owner")).toBeVisible();
}

/**
 * The team's portal login as printed on its ID cards: Team ID and the
 * one-time code. Tests read (or issue, as printing would) the code straight
 * from the database.
 */
export async function teamCredentials(memberEmail: string): Promise<{ teamCode: string; participantCode: string; code: string }> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  try {
    const { rows: [p] } = await pool.query(
      "select p.participant_code, t.id as team_id, t.team_code from participants p join teams t on t.id = p.team_id where lower(p.email) = lower($1)", [memberEmail]);
    const fresh = Array.from({ length: 8 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
    const { rows: [c] } = await pool.query(
      `insert into team_activation_codes (team_id, code) values ($1, $2)
       on conflict (team_id) do update set code = team_activation_codes.code returning code`, [p.team_id, fresh]);
    return { teamCode: p.team_code, participantCode: p.participant_code, code: c.code };
  } finally {
    await pool.end();
  }
}

/** Registers a two-member team through the public form (names must be letters only). */
export async function registerTeam(page: Page, teamName: string, members: [string, string][]) {
  await page.goto(`/register/${FORM_SLUG}`);
  await page.getByLabel("Team name").fill(teamName);
  await page.getByLabel("College / institution").fill("Test College");
  const phoneBase = String(Date.now()).slice(-7);
  for (const [i, [name, email]] of members.entries()) {
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^Member ${i + 1}`) }) });
    await card.getByLabel("Full name").fill(name);
    await card.getByLabel("Email").fill(email);
    await card.getByLabel("Phone number").fill(`+91 9${phoneBase}${i}${Math.floor(Math.random() * 10)}`);
    await card.getByLabel("Department").fill("CSE");
    await card.getByLabel("Academic year").fill("2nd Year");
  }
  const track = page.getByLabel(/Which track/);
  if (await track.count()) await track.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByText("Registration received!")).toBeVisible();
}
