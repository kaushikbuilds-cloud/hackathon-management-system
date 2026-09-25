import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, signIn } from "./helpers";

// Reads the printed code straight from the database (the PDF text is glyph-encoded).
const dbUrl = process.env.E2E_DATABASE_URL;

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !dbUrl, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

let PARTICIPANT = ""; // any member who has no account yet
const password = `Kabir-${Date.now().toString(36)}-Pass1!`;
let code = "";

test("printing a team's cards issues a one-time activation code per member without an account", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    const { rows } = await pool.query(
      `select p.team_id, p.id, p.participant_code from participants p
        where not exists (select 1 from profiles pr where pr.participant_id = p.id)
          and exists (select 1 from participants l join profiles pr on pr.participant_id = l.id where l.team_id = p.team_id)
        order by p.participant_code limit 1`);
    PARTICIPANT = rows[0].participant_code;
    const res = await page.request.get(`/api/teams/${rows[0].team_id}/id-cards/preview`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    const codes = await pool.query(
      `select p.participant_code, case when c.used_at is null then c.code end as code
         from participants p left join participant_activation_codes c on c.participant_id = p.id
        where p.team_id = $1 order by 1`, [rows[0].team_id]);
    const byCode = Object.fromEntries(codes.rows.map((r) => [r.participant_code, r.code]));
    const withAccount = await pool.query(
      "select p.participant_code from participants p join profiles pr on pr.participant_id = p.id where p.team_id = $1 limit 1", [rows[0].team_id]);
    expect(byCode[withAccount.rows[0].participant_code]).toBeNull(); // members with an account have no usable code
    expect(byCode[PARTICIPANT]).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    code = byCode[PARTICIPANT];
    // Reprinting keeps the same code.
    await page.request.get(`/api/teams/${rows[0].team_id}/id-cards/preview`);
    const again = await pool.query("select code from participant_activation_codes where participant_id = $1", [rows[0].id]);
    expect(again.rows[0].code).toBe(code);
  } finally {
    await pool.end();
  }
});

test("a wrong code is rejected, the right one activates and signs the participant in", async ({ page }) => {
  await page.goto("/activate");
  await page.getByLabel("Participant ID").fill(PARTICIPANT);
  await page.getByLabel("Activation code").fill(code === "ABCDEFGH" ? "HGFEDCBA" : "ABCDEFGH");
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByText("do not match")).toBeVisible();

  await page.getByLabel("Activation code").fill(`${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page).toHaveURL(/\/portal/);
});

test("the code is single use and the participant signs in with their Participant ID", async ({ page }) => {
  await page.goto("/activate");
  await page.getByLabel("Participant ID").fill(PARTICIPANT);
  await page.getByLabel("Activation code").fill(code);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByText("already has an account")).toBeVisible();

  await signIn(page, PARTICIPANT.toLowerCase(), password);
  await expect(page).toHaveURL(/\/portal/);
});
