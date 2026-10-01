import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { creds, signIn } from "./helpers";

/**
 * Self-serve sign-up and payment. Runs only when the app was started with the
 * test Razorpay settings (see README): RAZORPAY_KEY_ID=rzp_test_e2e,
 * RAZORPAY_KEY_SECRET=$E2E_RAZORPAY_SECRET, RAZORPAY_WEBHOOK_SECRET=$E2E_RAZORPAY_WEBHOOK_SECRET
 * and RAZORPAY_API_URL=http://127.0.0.1:4010/v1 (this file serves that stand-in API).
 */
const SECRET = process.env.E2E_RAZORPAY_SECRET ?? "";
const WEBHOOK = process.env.E2E_RAZORPAY_WEBHOOK_SECRET ?? "";
test.describe.configure({ mode: "serial" });
test.skip(!SECRET || !WEBHOOK || !process.env.E2E_DATABASE_URL || !creds.superAdmin.password, "Set E2E_RAZORPAY_SECRET, E2E_RAZORPAY_WEBHOOK_SECRET and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const email = `organiser.${run}@e2e.test`;
const password = `Organiser-${run}-Pass1!`;
const hackName = `Self Serve Hack ${run}`;
const orders = new Map<string, number>();
let api: Server;

test.beforeAll(async () => {
  // A stand-in for api.razorpay.com: creates orders and reports payments as captured.
  api = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST" && req.url === "/v1/orders") {
        const { amount } = JSON.parse(body);
        const id = `order_e2e${Math.random().toString(36).slice(2, 12)}`;
        orders.set(id, amount);
        return res.end(JSON.stringify({ id, amount, currency: "INR", status: "created" }));
      }
      const m = req.url?.match(/^\/v1\/payments\/pay_(\w+)$/);
      if (req.method === "GET" && m) {
        const orderId = `order_${m[1]}`;
        return res.end(JSON.stringify({ id: `pay_${m[1]}`, order_id: orderId, amount: orders.get(orderId) ?? 0, currency: "INR", status: "captured" }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { description: "not found" } }));
    });
  });
  await new Promise<void>((resolve) => api.listen(4010, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  api?.close();
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  await pool.query("delete from hackathons where name = $1", [hackName]);
  await pool.end();
});

test("an organiser signs up, pays with Razorpay and lands in their new hackathon", async ({ page }) => {
  // Stand-in for Razorpay Checkout: "pays" at once and signs the result like Razorpay does.
  await page.addInitScript((secret: string) => {
    (window as unknown as { Razorpay: unknown }).Razorpay = class {
      o: { order_id: string; handler: (r: unknown) => void };
      constructor(o: { order_id: string; handler: (r: unknown) => void }) { this.o = o; }
      on() {}
      async open() {
        const paymentId = `pay_${this.o.order_id.slice(6)}`;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${this.o.order_id}|${paymentId}`));
        const signature = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
        this.o.handler({ razorpay_order_id: this.o.order_id, razorpay_payment_id: paymentId, razorpay_signature: signature });
      }
    };
  }, SECRET);

  await page.goto("/");
  await page.getByRole("link", { name: /Start your hackathon/ }).first().click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByText("₹299").first()).toBeVisible();
  await page.getByLabel("Your name").fill("Olivia Organiser");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel(/College, club or company/).fill("Riverside College");
  await page.getByLabel(/Hackathon name/).fill(hackName);
  await page.getByLabel(/I agree to pay/).check();
  await page.getByRole("button", { name: "Continue to payment" }).click();

  await expect(page).toHaveURL(/\/start\/pay$/);
  await expect(page.getByText(hackName)).toBeVisible();
  // Not paid yet: the staff area sends them back here.
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/start\/pay$/);

  await page.getByRole("button", { name: "Pay ₹299" }).click();
  await expect(page).toHaveURL(/\/staff\?notice=/, { timeout: 20000 });
  await expect(page.getByText("Payment received. Your hackathon is ready")).toBeVisible();
  await expect(page.getByText(hackName).first()).toBeVisible();
  // Full Admin access to their own hackathon.
  await page.goto("/staff/event");
  await expect(page.getByRole("heading", { name: /Event Setup/ })).toBeVisible();
});

test("the webhook is idempotent and rejects bad signatures", async ({ request }) => {
  const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
  const { rows: [o] } = await pool.query("select razorpay_order_id, razorpay_payment_id, hackathon_id from hackathon_orders where email = $1 and status = 'paid'", [email]);
  const body = JSON.stringify({ event: "order.paid", payload: { order: { entity: { id: o.razorpay_order_id } }, payment: { entity: { id: o.razorpay_payment_id, order_id: o.razorpay_order_id } } } });
  const bad = await request.post("/api/razorpay/webhook", { data: body, headers: { "content-type": "application/json", "x-razorpay-signature": "nope" } });
  expect(bad.status()).toBe(401);
  const ok = await request.post("/api/razorpay/webhook", { data: body, headers: { "content-type": "application/json", "x-razorpay-signature": createHmac("sha256", WEBHOOK).update(body).digest("hex") } });
  expect(await ok.json()).toEqual({ ok: true });
  const { rows } = await pool.query("select count(*)::int as n from hackathons where name = $1", [hackName]);
  expect(rows[0].n).toBe(1);
  await pool.end();
});

test("the Super Admin sees the payment and sets the price", async ({ page }) => {
  await signIn(page, creds.superAdmin.email, creds.superAdmin.password);
  await page.goto("/staff/payments");
  const row = page.getByRole("row").filter({ hasText: hackName });
  await expect(row).toContainText("Paid");
  await expect(row).toContainText("₹299");
  await page.getByLabel("Price in ₹").fill("3499");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("Price saved.")).toBeVisible();
  await page.goto("/start");
  await expect(page.getByText("₹3,499").first()).toBeVisible();
  await page.goto("/staff/payments");
  await page.getByLabel("Price in ₹").fill("299");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("Price saved.")).toBeVisible();
});
