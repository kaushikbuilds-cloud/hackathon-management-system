import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import pg from "pg";
import { creds, openHackathon, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !creds.superAdmin.password || !creds.official.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD, E2E_SUPER_ADMIN_PASSWORD, E2E_OFFICIAL_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const throwaway = `E2E Ending ${run}`;

test("the Admin sets an award and downloads certificates", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/certificates");
  await expect(page.getByRole("heading", { name: "Certificates" })).toBeVisible();
  const sample = await page.request.get("/api/certificates/sample");
  expect(sample.status()).toBe(200);
  expect(sample.headers()["content-type"]).toContain("application/pdf");

  const firstTeam = page.getByRole("listitem").filter({ has: page.getByLabel("Award (optional)") }).first();
  await firstTeam.getByLabel("Award (optional)").fill("Best Design");
  await firstTeam.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Award saved: Best Design.")).toBeVisible();
  const teamLink = page.getByRole("link", { name: "Download team certificates" }).first();
  const teamPdf = await page.request.get((await teamLink.getAttribute("href"))!);
  expect(teamPdf.status()).toBe(200);

  const zip = await page.request.get("/api/certificates/zip");
  expect(zip.status()).toBe(200);
  const entries = Object.keys(unzipSync(new Uint8Array(await zip.body())));
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every((e) => e.endsWith("_Certificate.pdf"))).toBe(true);

  // Clean up: back to a participation certificate.
  await page.getByRole("listitem").filter({ has: page.getByLabel("Award (optional)") }).first().getByLabel("Award (optional)").fill("");
  await page.getByRole("listitem").filter({ has: page.getByLabel("Award (optional)") }).first().getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Award removed/)).toBeVisible();
});

test("ending a hackathon closes it, and the full data ZIP has the data and README", async ({ page }) => {
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  await pool.query("insert into hackathons (name, organizer_name, status) values ($1, 'E2E College', 'active')", [throwaway]);
  await pool.end();

  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await openHackathon(page, throwaway);
  await page.goto("/staff/end");
  await expect(page.getByRole("heading", { name: "End the hackathon" })).toBeVisible();
  await page.getByLabel("Type END to confirm").fill("END");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "End hackathon" }).click();
  await expect(page.getByText("The hackathon has ended.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "This hackathon has ended" })).toBeVisible();

  await page.getByRole("button", { name: "Prepare full data download" }).click();
  await expect(page.getByText("Full data ready.")).toBeVisible({ timeout: 60000 });
  const link = page.getByRole("link", { name: /_full_export\.zip$/ });
  const res = await page.request.get((await link.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  const files = unzipSync(new Uint8Array(await res.body()));
  expect(Object.keys(files)).toEqual(expect.arrayContaining(["README.txt", "data/teams.csv", "data/participants.csv", "data/food_orders.csv", "data/audit_log.csv"]));
  expect(strFromU8(files["README.txt"])).toContain(`${throwaway}: full data export`);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reopen (platform owner)" }).click();
  await expect(page.getByText("Hackathon reopened.")).toBeVisible();
});

test("teams and staff without event rights cannot download exports", async ({ page }) => {
  await signIn(page, creds.official.email, creds.official.password);
  await page.goto("/staff/end");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  for (const url of ["/api/certificates/zip", "/api/certificates/sample"]) {
    expect((await page.request.get(url)).status()).toBe(403);
  }
  expect((await page.request.get("/api/portal/certificates")).status()).toBe(401);
});
