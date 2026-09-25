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
 * Portal credentials as printed on a member's ID card. The registration page
 * no longer shows them, so tests read (or issue, as printing would) the
 * one-time activation code straight from the database.
 */
export async function cardCredentials(email: string): Promise<{ participantCode: string; teamCode: string; code: string }> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  try {
    const { rows: [p] } = await pool.query("select p.id, p.participant_code, t.team_code from participants p join teams t on t.id = p.team_id where lower(p.email) = lower($1)", [email]);
    const fresh = Array.from({ length: 8 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
    const { rows: [c] } = await pool.query(
      `insert into participant_activation_codes (participant_id, code) values ($1, $2)
       on conflict (participant_id) do update set code = participant_activation_codes.code returning code`, [p.id, fresh]);
    return { participantCode: p.participant_code, teamCode: p.team_code, code: c.code };
  } finally {
    await pool.end();
  }
}
