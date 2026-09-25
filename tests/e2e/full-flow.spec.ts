import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { FORM_SLUG, creds, signIn, signOut, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const teamName = `E2E Rockets ${run}`;
const leader = { name: "Priya Raman", email: `priya.${run}@e2e.test` };
const member = { name: "Dev Malhotra", email: `dev.${run}@e2e.test` };
let teamCode = "";
let teamUrl = "";
let leaderPid = "";
let leaderCode = "";
// Phone numbers must be unique across teams, so each run uses its own.
const phoneBase = String(Date.now()).slice(-8);

test.skip(!creds.admin.password || !creds.official.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD, E2E_OFFICIAL_PASSWORD and E2E_DATABASE_URL (see README).");

async function fillMember(page: import("@playwright/test").Page, index: number, m: { name: string; email: string }, phoneSlot = index) {
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^Member ${index + 1}`) }) });
  await card.getByLabel("Full name").fill(m.name);
  await card.getByLabel("Email").fill(m.email);
  await card.getByLabel("Phone number").fill(`+91 9${phoneBase}${phoneSlot}`);
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
  // IDs and portal credentials are only on the ID cards, never on the public page.
  await expect(page.getByText(/-[TP]\d{4,}$/)).toHaveCount(0);
  await expect(page.getByText(/printed only on the ID card/)).toBeVisible();
  const lead = await teamCredentials(leader.email);
  const mem = await teamCredentials(member.email);
  leaderPid = lead.participantCode;
  teamCode = lead.teamCode;
  expect(teamCode).toMatch(/^[A-Z0-9]{2,10}-T\d{4,}$/);
  leaderCode = lead.code;
  expect(leaderPid).toMatch(new RegExp(`^${teamCode.split("-T")[0]}-P\\d{4,}$`));
  expect(leaderCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
  expect(mem).toEqual({ ...lead, participantCode: mem.participantCode }); // one login per team
});

test("duplicate team names are rejected and entered data is preserved", async ({ page }) => {
  await page.goto(`/register/${FORM_SLUG}`);
  await page.getByLabel("Team name").fill(teamName.toUpperCase().replace(" ", "   "));
  await page.getByLabel("College / institution").fill("Another College");
  await fillMember(page, 0, { name: "Someone Else", email: `else.${run}@e2e.test` }, 5);
  await fillMember(page, 1, { name: "Another Person", email: `another.${run}@e2e.test` }, 6);
  const track = page.getByLabel(/Which track/);
  if (await track.count()) await track.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit registration" }).click();

  await expect(page.getByText(/already registered/).first()).toBeVisible();
  await expect(page.getByLabel("College / institution")).toHaveValue("Another College");
  const firstMember = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Member 1/ }) });
  await expect(firstMember.getByLabel("Full name")).toHaveValue("Someone Else");
});

test("a phone number already used in another team is rejected", async ({ page }) => {
  await page.goto(`/register/${FORM_SLUG}`);
  await page.getByLabel("Team name").fill(`Phone Clash ${run}`);
  await page.getByLabel("College / institution").fill("Another College");
  await fillMember(page, 0, { name: "New Leader", email: `newlead.${run}@e2e.test` }, 7);
  await fillMember(page, 1, { name: "Reused Phone", email: `reused.${run}@e2e.test` }, 1);
  const track = page.getByLabel(/Which track/);
  if (await track.count()) await track.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByText("This phone number is already registered in another team.")).toBeVisible();
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

test("the team page shows the shared team login", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto(teamUrl);
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Team login", exact: true }) }).last();
  await expect(card).toContainText("Not activated yet");
  await expect(card).not.toContainText(leaderCode); // codes are only printed on the ID cards
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

test("official checks in a participant once; duplicates are blocked; admin areas are closed", async ({ page }) => {
  await signIn(page, creds.official.email, creds.official.password);
  await expect(page.getByText("Official Portal").first()).toBeVisible();
  await page.goto(`/staff/attendance/manual?q=${encodeURIComponent(member.email)}`);
  const item = page.getByRole("listitem").filter({ hasText: member.name });
  await expect(item).not.toContainText(member.email); // contact-free lookup
  page.once("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Check in" }).click();
  await expect(item.getByText("Present")).toBeVisible();
  await expect(item.getByRole("button", { name: "Check in" })).toHaveCount(0);

  await page.goto("/staff/attendance/history");
  await expect(page.getByRole("table", { name: "Attendance history" })).toContainText(member.name);

  for (const path of ["/staff/users/officials", "/staff/users/admins", "/staff/teams", "/staff/audit"]) {
    await page.goto(path);
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  }
});

test("the team activates its shared login, sees only its team and raises support", async ({ page }) => {
  expect(leaderCode).not.toBe("");
  // A Participant ID is not a login any more.
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(leaderPid);
  await page.getByLabel("Activation code").fill(leaderCode);
  await page.getByLabel("New password").fill(`Rocket-${run}-Pass!`);
  await page.getByLabel("Confirm password").fill(`Rocket-${run}-Pass!`);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByText(`${leaderPid} is a Participant ID. Your team signs in with its Team ID`)).toBeVisible();

  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(leaderCode);
  await page.getByLabel("New password").fill(`Rocket-${run}-Pass!`);
  await page.getByLabel("Confirm password").fill(`Rocket-${run}-Pass!`);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  await expect(page.getByText("Team dashboard")).toBeVisible();
  await expect(page.getByRole("table", { name: "Team members" })).toContainText(member.email);
  await expect(page.getByText("Code Ninjas")).toHaveCount(0);

  // The code is single-use.
  await page.context().clearCookies();
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(leaderCode);
  await page.getByLabel("New password").fill(`Rocket-${run}-Pass!`);
  await page.getByLabel("Confirm password").fill(`Rocket-${run}-Pass!`);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByText("Your team has already activated its login")).toBeVisible();
  await signIn(page, teamCode.toLowerCase(), `Rocket-${run}-Pass!`);

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
  await signIn(page, teamCode, `Rocket-${run}-Pass!`);
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
  for (const path of ["/staff", "/staff/teams", "/staff/attendance", "/staff/attendance/manual", "/staff/support", "/staff/food", "/staff/food/menu", "/staff/food/meals", "/staff/settings"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} — ${v.help}`)).toEqual([]);
  }
});
