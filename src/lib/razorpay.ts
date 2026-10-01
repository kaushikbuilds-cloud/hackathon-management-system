import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay (Orders API + Checkout). Keys come from the server environment:
 * RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET.
 * RAZORPAY_API_URL is only for tests (a local stand-in for api.razorpay.com).
 */
export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
    apiUrl: (process.env.RAZORPAY_API_URL || "https://api.razorpay.com/v1").replace(/\/$/, ""),
    enabled: Boolean(keyId && keySecret),
    testMode: keyId.startsWith("rzp_test_"),
  };
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { keyId, keySecret, apiUrl } = razorpayConfig();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(body.error?.description || `Razorpay request failed (${res.status})`);
  return body;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string; receipt?: string };
export type RazorpayPayment = { id: string; order_id: string; amount: number; currency: string; status: string; email?: string };

export function createRazorpayOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
  return api<RazorpayOrder>("/orders", { method: "POST", body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes }) });
}

export function fetchRazorpayPayment(paymentId: string) {
  return api<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

function sameHex(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout's success handler: signature = HMAC_SHA256(order_id + "|" + payment_id, key secret). */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret } = razorpayConfig();
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  return sameHex(createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
}

/** Webhooks: X-Razorpay-Signature = HMAC_SHA256(raw body, webhook secret). */
export function webhookSignatureValid(rawBody: string, signature: string | null): boolean {
  const { webhookSecret } = razorpayConfig();
  if (!webhookSecret || !signature) return false;
  return sameHex(createHmac("sha256", webhookSecret).update(rawBody).digest("hex"), signature);
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
}
