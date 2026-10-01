import "server-only";
import { audit } from "@/lib/audit";
import { DEFAULT_TEMPLATE_CONFIG } from "@/lib/domain/template";
import { createRazorpayOrder, fetchRazorpayPayment, razorpayConfig } from "@/lib/razorpay";
import { createServiceClient } from "@/lib/supabase/server";

export type HackathonOrder = {
  id: string; profile_id: string | null; email: string; organiser_name: string; organisation: string; hackathon_name: string;
  amount_paise: number; currency: string; razorpay_order_id: string | null; razorpay_payment_id: string | null;
  status: "pending" | "paid" | "failed"; hackathon_id: string | null; created_at: string; paid_at: string | null;
};

/** The price of one hackathon, in paise (set by the Super Admin). */
export async function hackathonPricePaise(): Promise<number> {
  const { data } = await createServiceClient().from("platform_settings").select("hackathon_price_paise").eq("id", true).maybeSingle<{ hackathon_price_paise: number }>();
  return data?.hackathon_price_paise ?? 29900;
}

/**
 * How organisers pay: Razorpay Checkout when API keys are set; otherwise a
 * Razorpay Payment Page link the Super Admin saved, with manual approval.
 */
export async function paymentMode(): Promise<{ mode: "checkout" } | { mode: "link"; link: string } | { mode: "off" }> {
  if (razorpayConfig().enabled) return { mode: "checkout" };
  const { data } = await createServiceClient().from("platform_settings").select("payment_link").eq("id", true).maybeSingle<{ payment_link: string | null }>();
  return data?.payment_link ? { mode: "link", link: data.payment_link } : { mode: "off" };
}

/** The organiser's open order at today's price (a new Razorpay order if the price changed or none exists). */
export async function openOrderFor(input: { profileId: string; email: string; organiserName: string; organisation: string; hackathonName: string }): Promise<HackathonOrder> {
  const service = createServiceClient();
  const price = await hackathonPricePaise();
  const { data: existing } = await service.from("hackathon_orders").select("*").eq("profile_id", input.profileId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle<HackathonOrder>();
  const checkout = razorpayConfig().enabled;
  // A payment ID sent for manual approval keeps its order until the Super Admin decides.
  if (existing?.razorpay_payment_id) return existing;
  if (existing && (existing.razorpay_order_id || !checkout) && existing.amount_paise === price && existing.hackathon_name === input.hackathonName.trim()) return existing;

  const { data: row, error } = await service.from("hackathon_orders").insert({
    profile_id: input.profileId, email: input.email, organiser_name: input.organiserName.trim(), organisation: input.organisation.trim(),
    hackathon_name: input.hackathonName.trim(), amount_paise: price,
  }).select("*").single<HackathonOrder>();
  if (error || !row) throw new Error(error?.message ?? "Could not create the order.");
  const retire = async () => {
    if (existing && existing.id !== row.id) await service.from("hackathon_orders").update({ status: "failed" }).eq("id", existing.id).eq("status", "pending");
  };
  if (!checkout) {
    await retire();
    return row;
  }
  const order = await createRazorpayOrder({
    amountPaise: price, receipt: `hgos_${row.id.slice(0, 30)}`,
    notes: { hackathon: input.hackathonName.slice(0, 100), organisation: input.organisation.slice(0, 100), email: input.email },
  });
  const { data: saved } = await service.from("hackathon_orders").update({ razorpay_order_id: order.id }).eq("id", row.id).select("*").single<HackathonOrder>();
  await retire();
  return saved ?? { ...row, razorpay_order_id: order.id };
}

/**
 * A payment came back (Checkout handler or webhook): confirm with Razorpay that
 * it belongs to this order, for the full amount, and went through; then create
 * the hackathon (once, however many times this runs).
 */
export async function completePayment(razorpayOrderId: string, paymentId: string, source: "checkout" | "webhook"): Promise<{ ok: true; hackathonId: string } | { ok: false; error: string }> {
  const service = createServiceClient();
  const { data: order } = await service.from("hackathon_orders").select("*").eq("razorpay_order_id", razorpayOrderId).maybeSingle<HackathonOrder>();
  if (!order) return { ok: false, error: "We couldn't find this order." };
  if (order.hackathon_id) return { ok: true, hackathonId: order.hackathon_id };
  let payment;
  try {
    payment = await fetchRazorpayPayment(paymentId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not confirm the payment with Razorpay." };
  }
  if (payment.order_id !== razorpayOrderId || payment.amount !== order.amount_paise || payment.currency !== "INR" || !["authorized", "captured"].includes(payment.status)) {
    return { ok: false, error: "This payment doesn't match the order. If money was taken, contact us with the payment ID." };
  }
  const { data: hackathonId, error } = await service.rpc("provision_paid_hackathon", { p_razorpay_order: razorpayOrderId, p_payment: paymentId, p_template: DEFAULT_TEMPLATE_CONFIG });
  if (error || !hackathonId) return { ok: false, error: "Payment received, but the hackathon could not be created. We'll fix it; contact us with the payment ID." };
  await audit(null, "billing.hackathon_purchased", { type: "hackathons", id: hackathonId as string }, { order: order.id, payment: paymentId, amount_paise: order.amount_paise, source, hackathon_id: hackathonId });
  return { ok: true, hackathonId: hackathonId as string };
}

/** Payment IDs as Razorpay shows them on receipts. */
export const PAYMENT_ID_RE = /^pay_[A-Za-z0-9]{14}$/;

/** The Super Admin checked a Payment Page payment in Razorpay: create the hackathon. */
export async function approveManualPayment(orderId: string): Promise<{ ok: true; hackathonId: string } | { ok: false; error: string }> {
  const service = createServiceClient();
  const { data: order } = await service.from("hackathon_orders").select("*").eq("id", orderId).maybeSingle<HackathonOrder>();
  if (!order || order.status !== "pending" || !order.razorpay_payment_id) return { ok: false, error: "This order has no payment waiting for approval." };
  const ref = order.razorpay_order_id ?? `manual_${order.id}`;
  if (!order.razorpay_order_id) await service.from("hackathon_orders").update({ razorpay_order_id: ref }).eq("id", order.id);
  const { data: hackathonId, error } = await service.rpc("provision_paid_hackathon", { p_razorpay_order: ref, p_payment: order.razorpay_payment_id, p_template: DEFAULT_TEMPLATE_CONFIG });
  if (error || !hackathonId) return { ok: false, error: "The hackathon could not be created. Please try again." };
  return { ok: true, hackathonId: hackathonId as string };
}
