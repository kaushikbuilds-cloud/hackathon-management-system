import { expect, test } from "@playwright/test";
import { creds, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.superAdmin.password || !creds.admin.password, "Set E2E_SUPER_ADMIN_PASSWORD and E2E_ADMIN_PASSWORD (see README).");

const run = Date.now().toString(36);
const official = { name: "Vani Volunteer", email: `vani.${run}@e2e.test`, password: `Volunteer-${run}-1!` };
let inviteLink = "";

test("only the Super Admin can reach Admin management", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/users/admins");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  await page.context().clearCookies();
  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await page.goto("/staff/users/admins");
  await expect(page.getByRole("heading", { name: "User Management · Admins" })).toBeVisible();
});

test("Super Admin invites an Official with limited permissions", async ({ page }) => {
  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await page.goto("/staff/users/officials");
  const form = page.locator("section").filter({ has: page.getByRole("heading", { name: "Invite Official" }) });
  await form.getByLabel("Full name").fill(official.name);
  await form.getByLabel("Email").fill(official.email);
  await form.getByLabel("Station (optional)").fill("Gate B");
  await form.getByRole("checkbox", { name: /QR check-in/ }).check();
  await form.getByRole("button", { name: "Create invitation" }).click();
  const link = page.locator("p.font-mono").filter({ hasText: "/invite/" });
  await expect(link).toBeVisible();
  inviteLink = (await link.innerText()).trim();
  await expect(page.getByRole("table", { name: "Officials invitations" })).toContainText(official.email);
});

test("the Official activates, lands in the Official Portal and sees only permitted areas", async ({ page }) => {
  await page.goto(new URL(inviteLink).pathname);
  await expect(page.getByText("Gate B")).toBeVisible();
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(official.password);
  await page.getByLabel("Confirm password").fill(official.password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByText("Official Portal").first()).toBeVisible();
  await expect(page.getByText("Gate B")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Official Portal navigation" }).first();
  await expect(nav.getByRole("link", { name: "QR Scanner" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Manual Check-in" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Team Management" })).toHaveCount(0);
  await page.goto("/staff/attendance/manual");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

test("the invitation cannot be reused and suspension blocks access", async ({ page }) => {
  await page.goto(new URL(inviteLink).pathname);
  await expect(page.getByText("Link not usable")).toBeVisible();

  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await page.goto("/staff/users/officials");
  const card = page.locator("section").filter({ hasText: official.email }).first();
  await card.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Account suspended.")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(official.email);
  await page.getByLabel("Password").fill(official.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
