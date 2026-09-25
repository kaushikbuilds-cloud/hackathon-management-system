import { expect, test } from "@playwright/test";
import { creds, registerTeam, signIn, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const publicQ = `Is parking available ${run}?`;
const teamQ = `Where is the charging station ${run}?`;

test("the Admin writes a public answer and a team-only answer", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/faq");
  const add = page.locator("section").filter({ has: page.getByRole("heading", { name: "Add a question", exact: true }) }).last();
  await add.getByLabel("Question").fill(publicQ);
  await add.getByLabel("Answer").fill("Yes, behind Block A.");
  await add.getByLabel("Category (optional)").fill("On the day");
  await add.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByText("Question added.")).toBeVisible();

  await add.getByLabel("Question").fill(teamQ);
  await add.getByLabel("Answer").fill("Next to the help desk.");
  await add.getByLabel("Shown to").selectOption("participants");
  await add.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("heading", { name: teamQ })).toBeVisible();
  // The preview shows what teams see.
  const preview = page.locator("section").filter({ has: page.getByRole("heading", { name: "What teams see" }) });
  const item = preview.locator("details").filter({ hasText: publicQ });
  await item.getByText(publicQ).click();
  await expect(item.getByText("Yes, behind Block A.")).toBeVisible();
});

test("visitors see only the public answer on the event page", async ({ page }) => {
  await page.goto(`/h/${process.env.E2E_EVENT_SLUG ?? "buildfest-2026"}`);
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  const item = page.locator("details").filter({ hasText: publicQ });
  await item.getByText(publicQ).click();
  await expect(item.getByText("Yes, behind Block A.")).toBeVisible();
  await expect(page.getByText(teamQ)).toHaveCount(0);
});

test("teams see both answers above their support requests", async ({ page }) => {
  const email = `faq.${run}@e2e.test`;
  await registerTeam(page, `Faq Readers ${run}`, [["Asha Reader", email], ["Ravi Reader", `faq2.${run}@e2e.test`]]);
  const { teamCode, code } = await teamCredentials(email);
  const password = `Faq-${run}-Pass1!`;
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(code);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await page.waitForURL(/\/portal/);
  await page.goto("/portal/support");
  await expect(page.getByText(publicQ)).toBeVisible();
  const item = page.locator("details").filter({ hasText: teamQ });
  await item.getByText(teamQ).click();
  await expect(item.getByText("Next to the help desk.")).toBeVisible();
});
