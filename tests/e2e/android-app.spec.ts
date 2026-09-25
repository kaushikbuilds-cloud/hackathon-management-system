import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, registerTeam, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const APP_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 HackathonBaseApp/1";

/** Stands in for the app's injected Capacitor bridge: hands out the given QR texts, then "cancel". */
function fakeNativeScanner(codes: string[]) {
  return `(() => {
    const codes = ${JSON.stringify(codes)};
    window.__scans = 0;
    window.Capacitor = { isNativePlatform: () => true, Plugins: { BarcodeScanner: {
      isGoogleBarcodeScannerModuleAvailable: async () => ({ available: true }),
      installGoogleBarcodeScannerModule: async () => {},
      scan: async () => {
        const text = codes[window.__scans++];
        if (!text) throw new Error("scan canceled.");
        return { barcodes: [{ rawValue: text }] };
      },
    } } };
  })();`;
}

test("the app opens on sign-in, not the landing page", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: APP_UA });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Get the Android app")).toHaveCount(0);
  await context.close();
});

test("in the app, Scan ID card uses the phone scanner and reopens it after each check-in", async ({ browser, page }) => {
  await registerTeam(page, `App Scanners ${run}`, [["Scan One", `scan1.${run}@e2e.test`], ["Scan Two", `scan2.${run}@e2e.test`]]);
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  const { rows } = await pool.query("select qr_token from participants where email = any($1) order by email", [[`scan1.${run}@e2e.test`, `scan2.${run}@e2e.test`]]);
  await pool.end();

  const context = await browser.newContext({ userAgent: APP_UA });
  await context.addInitScript(fakeNativeScanner(rows.map((r) => r.qr_token)));
  const app = await context.newPage();
  await signIn(app, creds.admin.email, creds.admin.password);
  await app.goto("/staff/attendance");
  await expect(app.getByRole("button", { name: "Start camera" })).toHaveCount(0);
  await app.getByRole("button", { name: "Scan ID card" }).click();
  // Both cards are checked in without tapping again; the third scan is cancelled.
  await expect(app.getByText(/Present: Scan Two \(.+\) checked in\./)).toBeVisible({ timeout: 15000 });
  await expect.poll(() => app.evaluate(() => (window as unknown as { __scans: number }).__scans)).toBe(3);
  await context.close();
});

test("in a normal browser the page keeps the camera scanner", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/attendance");
  await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan ID card" })).toHaveCount(0);
});
