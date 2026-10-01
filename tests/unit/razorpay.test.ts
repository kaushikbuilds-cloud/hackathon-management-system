import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Razorpay signatures", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
    process.env.RAZORPAY_KEY_SECRET = "unit_secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "unit_webhook";
  });
  afterEach(() => { delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET; delete process.env.RAZORPAY_WEBHOOK_SECRET; });

  it("accepts Checkout's signature over order|payment and rejects anything else", async () => {
    const { checkoutSignatureValid } = await import("@/lib/razorpay");
    const sig = createHmac("sha256", "unit_secret").update("order_1|pay_1").digest("hex");
    expect(checkoutSignatureValid("order_1", "pay_1", sig)).toBe(true);
    expect(checkoutSignatureValid("order_2", "pay_1", sig)).toBe(false);
    expect(checkoutSignatureValid("order_1", "pay_1", sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a"))).toBe(false);
    expect(checkoutSignatureValid("order_1", "pay_1", "")).toBe(false);
  });

  it("checks webhook bodies with the webhook secret", async () => {
    const { webhookSignatureValid } = await import("@/lib/razorpay");
    const body = JSON.stringify({ event: "order.paid" });
    expect(webhookSignatureValid(body, createHmac("sha256", "unit_webhook").update(body).digest("hex"))).toBe(true);
    expect(webhookSignatureValid(body, createHmac("sha256", "unit_secret").update(body).digest("hex"))).toBe(false);
    expect(webhookSignatureValid(body, null)).toBe(false);
  });

  it("formats rupees", async () => {
    const { formatInr } = await import("@/lib/razorpay");
    expect(formatInr(299900)).toBe("₹2,999");
    expect(formatInr(150)).toBe("₹1.50");
  });
});
