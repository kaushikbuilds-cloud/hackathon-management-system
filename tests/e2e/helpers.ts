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
