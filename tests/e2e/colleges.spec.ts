import { expect, test } from "@playwright/test";
import { creds, registerTeam, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const college = `Chip Institute ${run}`;

test("teams from differently spelled colleges are grouped under one college chip", async ({ page }) => {
  await registerTeam(page, `Chippers One ${run}`, [["Chip Lead", `chip1.${run}@e2e.test`], ["Chip Two", `chip2.${run}@e2e.test`]], { college });
  await registerTeam(page, `Chippers Two ${run}`, [["Chip Lead B", `chip3.${run}@e2e.test`], ["Chip Four", `chip4.${run}@e2e.test`]], { college: `  chip institute. ${run.toUpperCase()} ` });

  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/teams");
  const chips = page.getByRole("navigation", { name: "Teams by college" });
  const chip = chips.getByRole("link", { name: new RegExp(`^${college} 2$`) });
  await expect(chip).toBeVisible();

  await chip.click();
  await expect(page).toHaveURL(/college=/);
  await expect(chips.getByRole("link", { name: new RegExp(`^${college}`) })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("row").filter({ hasText: `Chippers One ${run}` })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `Chippers Two ${run}` })).toBeVisible();
  await expect(page.getByText(/Showing .*1.*–.*2.* of .*2/)).toBeVisible();

  // Tapping the active chip shows every college again.
  await chips.getByRole("link", { name: new RegExp(`^${college}`) }).click();
  await expect(page).not.toHaveURL(/college=/);
});
