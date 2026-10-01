"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { completePayment, openOrderFor, paymentMode, PAYMENT_ID_RE, type HackathonOrder } from "@/lib/billing";
import { checkPasswordStrength } from "@/lib/domain/password";
import { checkoutSignatureValid } from "@/lib/razorpay";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type StartState = { error?: string; values?: Record<string, string> };

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Enter a valid phone number.")]),
  organisation: z.string().trim().min(2, "Enter your college, club or company.").max(150),
  hackathon_name: z.string().trim().min(2, "Name your hackathon.").max(120),
});

/** Sign-up for organisers: the account is created now; the hackathon is created once they pay. */
export async function startHackathon(_prev: StartState, formData: FormData): Promise<StartState> {
  const raw = Object.fromEntries(["full_name", "email", "phone", "organisation", "hackathon_name"].map((k) => [k, String(formData.get(k) ?? "").slice(0, 300)]));
  const values = raw as Record<string, string>;
  if ((await paymentMode()).mode === "off") return { error: "Online payment isn't set up yet. Please try again later or contact us.", values };
  if (!(await rateLimit("registration", `signup|${await clientIp()}`))) return { error: "Too many sign-ups from your network. Please wait a while and try again.", values };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const password = String(formData.get("password") ?? "");
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak, values };
  if (password !== String(formData.get("confirm") ?? "")) return { error: "The passwords don't match.", values };
  if (formData.get("terms") !== "on") return { error: "Please accept the terms to continue.", values };
  const d = parsed.data;

  const service = createServiceClient();
  const { data: existing } = await service.from("profiles").select("id").eq("email", d.email).maybeSingle();
  if (existing) return { error: "An account with this email already exists. Sign in to continue, or use another email.", values };
  const { data: created, error } = await service.auth.admin.createUser({
    email: d.email, password, email_confirm: true, user_metadata: { full_name: d.full_name }, app_metadata: { role: "admin" },
  });
  if (error || !created.user) return { error: /already|registered|exists/i.test(error?.message ?? "") ? "An account with this email already exists. Sign in to continue." : "Could not create your account. Please try again.", values };
  const userId = created.user.id;
  await service.from("profiles").update({ full_name: d.full_name, phone: d.phone || null, status: "active", must_change_password: false }).eq("id", userId);
  await audit(null, "billing.signup", { type: "profiles", id: userId }, { email: d.email, hackathon: d.hackathon_name });

  try {
    await openOrderFor({ profileId: userId, email: d.email, organiserName: d.full_name, organisation: d.organisation, hackathonName: d.hackathon_name });
  } catch {
    // The account exists; the payment page will try to create the order again.
  }
  await (await createClient()).auth.signInWithPassword({ email: d.email, password });
  redirect("/start/pay");
}

/** Razorpay Checkout's success handler: verify the signature, confirm the payment, create the hackathon. */
export async function confirmPayment(input: { orderId: string; paymentId: string; signature: string }): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Please sign in again." };
  if (!checkoutSignatureValid(input.orderId, input.paymentId, input.signature)) return { error: "We couldn't verify this payment. If money was taken, contact us with the payment ID." };
  const { data: order } = await createServiceClient().from("hackathon_orders").select("profile_id").eq("razorpay_order_id", input.orderId).maybeSingle<{ profile_id: string | null }>();
  if (order?.profile_id !== session.userId) return { error: "This payment belongs to another account." };
  const result = await completePayment(input.orderId, input.paymentId, "checkout");
  if (!result.ok) return { error: result.error };
  redirect(`/staff?notice=${encodeURIComponent("Payment received. Your hackathon is ready: start with Event Setup.")}`);
}

/** Change the hackathon name before paying (creates a fresh order). */
export async function renameAndReorder(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.profile.role !== "admin" || session.hackathonId) redirect("/staff");
  const name = String(formData.get("hackathon_name") ?? "").trim().slice(0, 120);
  const organisation = String(formData.get("organisation") ?? "").trim().slice(0, 150);
  if (name.length < 2 || organisation.length < 2) redirect(`/start/pay?error=${encodeURIComponent("Enter the hackathon and organisation names.")}`);
  try {
    await openOrderFor({ profileId: session.userId, email: session.email ?? "", organiserName: session.profile.full_name ?? "Organiser", organisation, hackathonName: name });
  } catch {
    redirect(`/start/pay?error=${encodeURIComponent("Could not reach the payment provider. Please try again.")}`);
  }
  redirect("/start/pay");
}

/** Payment Page mode: the organiser sends the payment ID from their receipt; the Super Admin approves it. */
export async function submitManualPayment(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.profile.role !== "admin" || session.hackathonId) redirect("/staff");
  const back = (q: string) => redirect(`/start/pay?${q}`);
  const paymentId = String(formData.get("payment_id") ?? "").trim().slice(0, 40);
  if (!PAYMENT_ID_RE.test(paymentId)) back(`error=${encodeURIComponent("Enter the Payment ID from your Razorpay receipt. It looks like pay_ followed by 14 letters and numbers.")}`);
  if (!(await rateLimit("registration", `manual-pay|${session.userId}`))) back(`error=${encodeURIComponent("Too many tries. Please wait a while.")}`);
  const service = createServiceClient();
  const { data: order } = await service.from("hackathon_orders").select("*").eq("profile_id", session.userId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle<HackathonOrder>();
  if (!order) back(`error=${encodeURIComponent("We couldn't find your order. Reload the page and try again.")}`);
  if (order!.razorpay_payment_id) back(`notice=${encodeURIComponent("We already have your payment ID. It's being checked.")}`);
  const { error } = await service.from("hackathon_orders").update({ razorpay_payment_id: paymentId }).eq("id", order!.id).is("razorpay_payment_id", null);
  if (error) back(`error=${encodeURIComponent(error.code === "23505" ? "This payment ID has already been used for another order." : "Could not save the payment ID. Please try again.")}`);
  const { data: admins } = await service.from("profiles").select("id").eq("role", "super_admin");
  if (admins?.length) {
    await service.from("notifications").insert(admins.map((a: { id: string }) => ({
      profile_id: a.id, title: "Payment to approve", link: "/staff/payments",
      body: `${order!.organiser_name} (${order!.organisation}) paid for ${order!.hackathon_name}: ${paymentId}. Check it in Razorpay and approve.`,
    })));
  }
  await audit(null, "billing.manual_payment_submitted", { type: "hackathon_orders", id: order!.id }, { payment: paymentId });
  back(`notice=${encodeURIComponent("Thanks! We've received your payment ID. Your hackathon will be ready as soon as we confirm it, usually within a few hours.")}`);
}
