"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth";
import { approveManualPayment } from "@/lib/billing";
import { createServiceClient } from "@/lib/supabase/server";

const PATH = "/staff/payments";

/** The Super Admin sets the price of one hackathon (in rupees). */
export async function saveHackathonPrice(formData: FormData) {
  const session = await requireSuperAdmin();
  const rupees = Number(str(formData, "price", 12).replace(/[, ]/g, ""));
  if (!Number.isFinite(rupees) || rupees < 1 || rupees > 1000000) flash(PATH, { error: "Enter a price between ₹1 and ₹10,00,000." });
  const paise = Math.round(rupees * 100);
  const { error } = await createServiceClient(session.userId).from("platform_settings")
    .update({ hackathon_price_paise: paise, updated_at: new Date().toISOString(), updated_by: session.userId }).eq("id", true);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  await audit(session, "billing.price_changed", { type: "platform_settings", id: null }, { paise });
  revalidatePath(PATH);
  revalidatePath("/start");
  revalidatePath("/");
  flash(PATH, { notice: "Price saved. New sign-ups pay the new price." });
}

/** The Razorpay Payment Page organisers pay on while API keys aren't set. Empty turns it off. */
export async function savePaymentLink(formData: FormData) {
  const session = await requireSuperAdmin();
  const link = str(formData, "payment_link", 500).trim();
  if (link && !/^https:\/\/\S+$/.test(link)) flash(PATH, { error: "Paste the full link, starting with https://" });
  const { error } = await createServiceClient(session.userId).from("platform_settings")
    .update({ payment_link: link || null, updated_at: new Date().toISOString(), updated_by: session.userId }).eq("id", true);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  await audit(session, "billing.payment_link_changed", { type: "platform_settings", id: null }, { link: link || null });
  revalidatePath(PATH);
  flash(PATH, { notice: link ? "Payment link saved. Organisers can sign up and pay with it." : "Payment link removed." });
}

/** Approve a Payment Page payment after checking it in the Razorpay dashboard. */
export async function approvePayment(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = str(formData, "id", 64);
  const result = await approveManualPayment(id);
  if (!result.ok) flash(PATH, { error: result.error });
  await audit(session, "billing.manual_payment_approved", { type: "hackathon_orders", id }, { hackathon_id: result.ok ? result.hackathonId : null });
  revalidatePath(PATH);
  flash(PATH, { notice: "Approved. The organiser's hackathon is ready." });
}

/** Reject a payment ID that isn't in Razorpay (or is for the wrong amount); the organiser can send another. */
export async function rejectPayment(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = str(formData, "id", 64);
  const { data } = await createServiceClient(session.userId).from("hackathon_orders").update({ razorpay_payment_id: null })
    .eq("id", id).eq("status", "pending").select("profile_id, razorpay_payment_id");
  const row = data?.[0] as { profile_id: string | null } | undefined;
  if (row?.profile_id) {
    await createServiceClient().from("notifications").insert({ profile_id: row.profile_id, title: "Payment not found", link: "/start/pay",
      body: "We couldn't find your payment in Razorpay. Please check the Payment ID on your receipt and send it again, or contact us." });
  }
  await audit(session, "billing.manual_payment_rejected", { type: "hackathon_orders", id }, {});
  revalidatePath(PATH);
  flash(PATH, { notice: "Payment ID rejected. The organiser can send it again." });
}
