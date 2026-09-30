import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, openHackathon, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.superAdmin.password || !creds.admin.password, "Set E2E_SUPER_ADMIN_PASSWORD and E2E_ADMIN_PASSWORD (see README).");

const run = Date.now().toString(36);
const hackName = `E2E Second Hack ${run}`;
const organiser = { name: "Olivia Organiser", email: `olivia.${run}@e2e.test`, password: `Organiser-${run}-1!` };
let adminLink = "";

test("the public home page lists hackathons and invites organisers to contact the admin", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Want to conduct a hackathon?" })).toBeVisible();
  const contact = page.getByRole("link", { name: "Contact the admin" });
  await expect(contact).toHaveAttribute("href", /^mailto:kaushik\.builds@gmail\.com\?subject=/);
  await expect(page.getByRole("link", { name: /BuildFest/ }).first()).toBeVisible();
});

test("the Super Admin creates a hackathon and invites its Admin", async ({ page }) => {
  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await expect(page.getByRole("heading", { name: "Platform Dashboard" })).toBeVisible();
  await page.goto("/staff/hackathons");
  await page.getByLabel("Hackathon name").fill(hackName);
  await page.getByLabel("Organising institution").fill("Second College");
  await page.getByLabel("Admin name").fill(organiser.name);
  await page.getByLabel("Admin email").fill(organiser.email);
  await page.getByRole("button", { name: "Create hackathon" }).click();
  await expect(page.getByText(`${hackName} created`)).toBeVisible();
  const link = page.locator("p.font-mono").filter({ hasText: "/invite/" });
  adminLink = (await link.innerText()).trim();
  await expect(page.getByRole("table", { name: "Hackathons" })).toContainText(hackName);

  // The Super Admin now works in the new hackathon, so a new form belongs to it (not the previous one).
  await page.goto("/staff/forms/new");
  await expect(page.getByText(`For ${hackName}`)).toBeVisible();
});

test("an ended hackathon's form takes no more registrations", async ({ page }) => {
  test.skip(!process.env.E2E_DATABASE_URL, "Needs E2E_DATABASE_URL.");
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  const slug = `ended-form-${run}`;
  await pool.query(`with h as (insert into hackathons (name, status) values ($1, 'completed') returning id)
    insert into registration_forms (hackathon_id, slug, title, status, min_team_size, max_team_size) select id, $2, 'Old form', 'published', 2, 4 from h`, [`Ended Hack ${run}`, slug]);
  try {
    await page.goto(`/register/${slug}`);
    await expect(page.getByText(`Ended Hack ${run} has ended, so registration is closed.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit registration" })).toHaveCount(0);
  } finally {
    await pool.query("delete from hackathons where name = $1", [`Ended Hack ${run}`]);
    await pool.end();
  }
});

test("the new Admin activates and sees only their own, empty hackathon", async ({ page }) => {
  await page.goto(new URL(adminLink).pathname);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(organiser.password);
  await page.getByLabel("Confirm password").fill(organiser.password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByText(hackName).first()).toBeVisible();

  await page.goto("/staff/teams");
  await expect(page.getByText("Code Ninjas")).toHaveCount(0);
  await page.goto("/staff/users/officials");
  await expect(page.getByRole("heading", { name: "User Management · Officials" })).toBeVisible();
  await expect(page.getByText("official@example.com")).toHaveCount(0);
  await page.goto("/staff/hackathons");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

test("the first hackathon's Admin cannot see the new hackathon's staff", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/teams?q=Code%20Ninjas");
  await expect(page.getByText("Code Ninjas").first()).toBeVisible();
  await page.goto("/staff/users/officials");
  await expect(page.getByText(organiser.email)).toHaveCount(0);
});

test("the Super Admin can open a hackathon and return to the platform", async ({ page }) => {
  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await openHackathon(page, hackName);
  await expect(page.getByText(`You are viewing ${hackName}`)).toBeVisible();
  await page.goto("/staff/teams");
  await expect(page.getByText("Code Ninjas")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to platform" }).click();
  await expect(page).toHaveURL(/\/staff\/hackathons/);
  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "Platform Dashboard" })).toBeVisible();
});
