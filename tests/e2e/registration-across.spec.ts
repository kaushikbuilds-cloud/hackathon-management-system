import { expect, test } from "@playwright/test";
import pg from "pg";
import { FORM_SLUG, registerTeam } from "./helpers";

test.skip(!process.env.E2E_DATABASE_URL, "Set E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const phones = [`+91 8${String(Date.now()).slice(-8)}1`, `+91 8${String(Date.now()).slice(-8)}2`];
const members: [string, string][] = [["Roaming Leader", `roam1.${run}@e2e.test`], ["Roaming Member", `roam2.${run}@e2e.test`]];

test("the same people can register for two different hackathons, but only once in each", async ({ page }) => {
  // A second hackathon with a published copy of the demo form.
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  const { rows: [h] } = await pool.query("insert into hackathons (name, organizer_name, status) values ($1, 'Second College', 'active') returning id", [`E2E Other ${run}`]);
  const slug = `other-${run}`;
  await pool.query(
    `insert into registration_forms (hackathon_id, slug, title, status, min_team_size, max_team_size, field_config, custom_questions)
     select $1, $2, 'Other hackathon', 'published', min_team_size, max_team_size, field_config, custom_questions from registration_forms where slug = $3`,
    [h.id, slug, FORM_SLUG],
  );
  await pool.end();

  await registerTeam(page, `Roamers ${run}`, members, { phones });
  await registerTeam(page, `Roamers ${run}`, members, { phones, slug });

  // A second team in the first hackathon with the same phone numbers is still refused.
  await registerTeam(page, `Roamers Again ${run}`, [["Roaming Leader", `roam3.${run}@e2e.test`], ["Roaming Member", `roam4.${run}@e2e.test`]], { phones, expectOk: false });
  await expect(page.getByText("One of the member phone numbers is already registered in another team.")).toBeVisible();
});
