import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { FORM_SLUG, creds, signIn, signOut } from "./helpers";

test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const teamName = `E2E Rockets ${run}`;
const leader = { name: "Priya Raman", email: `priya.${run}@e2e.test` };
const member = { name: "Dev Malhotra", email: `dev.${run}@e2e.test` };
let teamCode = "";
let teamUrl = "";
let tempPassword = "";

test.skip(!creds.admin.password || !creds.official.password, "Set E2E_ADMIN_PASSWORD and E2E_OFFICIAL_PASSWORD (see README).");

async function fillMember(page: import("@playwright/test").Page, index: number, m: { name: string; email: string }) {
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^Member ${index + 1}`) }) });
  await card.getByLabel("Full name").fill(m.name);
  await card.getByLabel("Email").fill(m.email);
  await card.getByLabel("Phone number").fill(`+91 98000 1000${index}`);
  await card.getByLabel("Department").fill("Computer Science");
  await card.getByLabel("Academic year").fill("3rd Year");
}

test("public registration creates a team with generated IDs", async ({ page }) => {
  await page.goto(`/register/${FORM_SLUG}`);
  await page.getByLabel("Team name").fill(`  ${teamName}  `);
  await page.getByLabel("College / institution").fill("E2E Institute of Technology");
  await fillMember(page, 0, leader);
  await fillMember(page, 1, member);
  const track = page.getByLabel(/Which track/);
  if (await track.count()) await track.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit registration" }).click();

  await expect(page.getByText("Registration received!")).toBeVisible();
  teamCode = (await page.locator("dd").filter({ hasText: /^TEAM-\d{4}-\d{4,}$/ }).innerText()).trim();
  expect(teamCode).toMatch(/^TEAM-\d{4}-\d{4,}$/);
  await expect(page.getByText(/PRT-\d{4}-\d{4,}/)).toHaveCount(2);
});

test("duplicate team names are rejected and entered data is preserved", async ({ page }) => {
  await page.goto(`/register/${FORM_SLUG}`);
  await page.getByLabel("Team name").fill(teamName.toUpperCase().replace(" ", "   "));
  await page.getByLabel("College / institution").fill("Another College");
  await fillMember(page, 0, { name: "Someone Else", email: `else.${run}@e2e.test` });
  await fillMember(page, 1, { name: "Another Person", email: `another.${run}@e2e.test` });
  const track = page.getByLabel(/Which track/);
  if (await track.count()) await track.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit registration" }).click();

  await expect(page.getByText(/already registered/).first()).toBeVisible();
  await expect(page.getByLabel("College / institution")).toHaveValue("Another College");
  const firstMember = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Member 1/ }) });
  await expect(firstMember.getByLabel("Full name")).toHaveValue("Someone Else");
});

test("admin sees one row per team, expands members and opens details", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto(`/staff/teams?q=${encodeURIComponent(teamCode)}`);
  const row = page.getByRole("row").filter({ hasText: teamCode });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(leader.name);
  await expect(row).toContainText("Not Generated");
  await row.getByRole("link", { name: /Expand members/ }).click();
  await expect(page.getByRole("table", { name: `Members of ${teamName}` })).toContainText(member.email);

  await row.getByRole("link", { name: teamName, exact: true }).click();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  teamUrl = page.url();
  await expect(page.getByRole("table", { name: `Members of ${teamName}` })).toContainText("Team Leader");
});

test("admin issues a temporary password (shown once, never on the card)", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto(teamUrl);
  await page.locator("summary").filter({ hasText: leader.name }).click();
  await page.getByRole("button", { name: "Create account (temp password)" }).click();
  const code = page.locator("code").first();
  await expect(code).toBeVisible();
  tempPassword = (await code.innerText()).trim();
  expect(tempPassword).toHaveLength(14);
});

test("team PDF: one page per member, correct filename, status updates", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto(`${teamUrl}/id-cards`);
  await expect(page.getByText("PDF pages")).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(2);

  const preview = await page.request.get(`${teamUrl.replace("/staff/teams/", "/api/teams/")}/id-cards/preview`);
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toContain("application/pdf");
  expect((await PDFDocument.load(await preview.body())).getPageCount()).toBe(2);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Generate & Download PDF/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`E2E_Rockets_${run}_${teamCode}_ID_Cards.pdf`);
  const pdf = await PDFDocument.load(await readFile((await download.path())!));
  expect(pdf.getPageCount()).toBe(2);
  const { width, height } = pdf.getPage(0).getSize();
  expect(height).toBeGreaterThan(width);
  await expect(page.getByText("PDF ready")).toBeVisible();

  await page.goto(`/staff/teams?q=${encodeURIComponent(teamCode)}`);
  await expect(page.getByRole("row").filter({ hasText: teamCode })).toContainText("Generated");
});

test("official checks in a participant once; duplicates are blocked", async ({ page }) => {
  await signIn(page, creds.official.email, creds.official.password);
  await expect(page).toHaveURL(/\/staff\/attendance/);
  await page.getByLabel("Search participants").fill(member.email);
  await page.getByRole("button", { name: "Search" }).click();
  const item = page.getByRole("listitem").filter({ hasText: member.name });
  page.once("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Check in" }).click();
  await expect(item.getByText("Present")).toBeVisible();
  await expect(item.getByRole("button", { name: "Check in" })).toHaveCount(0);

  // Officials cannot reach admin-only pages.
  await page.goto("/staff/officials");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

test("team leader signs in, must change password, sees only their team and raises support", async ({ page }) => {
  expect(tempPassword).not.toBe("");
  await signIn(page, leader.email, tempPassword);
  await expect(page).toHaveURL(/\/change-password/);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(`Rocket-${run}-Pass!`);
  await page.getByLabel("Confirm new password").fill(`Rocket-${run}-Pass!`);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expect(page.getByRole("table", { name: "Team members" })).toContainText(member.name);
  await expect(page.getByText("Code Ninjas")).toHaveCount(0);

  // Staff areas are closed to participants.
  await page.goto("/staff/teams");
  await expect(page).toHaveURL(/\/portal/);

  await page.goto("/portal/support/new");
  await page.getByLabel("Subject").fill("Projector not working");
  await page.getByLabel("Description").fill("The projector at table 7 shows no signal.");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Support request submitted")).toBeVisible();
  await expect(page.getByText("New", { exact: true }).first()).toBeVisible();
});

test("admin assigns and progresses support; the team sees the update", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/support");
  await page.getByRole("link", { name: "Projector not working" }).first().click();
  const assign = page.getByLabel("Assign to");
  const officialValue = await assign.locator("option", { hasText: "(official)" }).first().getAttribute("value");
  await assign.selectOption(officialValue!);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Request assigned.")).toBeVisible();
  await page.getByLabel("Move to").selectOption("in_progress");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Status updated")).toBeVisible();
  await page.getByLabel("Reply").fill("A technician is on the way.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("A technician is on the way.")).toBeVisible();

  await signOut(page);
  await signIn(page, leader.email, `Rocket-${run}-Pass!`);
  await page.goto("/portal/support");
  await expect(page.getByRole("row").filter({ hasText: "Projector not working" })).toContainText("In progress");
  await page.goto("/portal/notifications");
  await expect(page.getByText("New response to your support request").first()).toBeVisible();
});

test("core pages have no serious accessibility violations @responsive", async ({ page }) => {
  for (const path of ["/", `/register/${FORM_SLUG}`, "/login"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} — ${v.help}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("staff pages are accessible and responsive @responsive", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  for (const path of ["/staff", "/staff/teams", "/staff/attendance", "/staff/support"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} — ${v.help}`)).toEqual([]);
  }
});
