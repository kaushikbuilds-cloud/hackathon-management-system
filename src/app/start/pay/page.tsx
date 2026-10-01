import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/client";
import { PublicShell } from "@/components/layout/public-shell";
import { Alert, Card, Flash, TextField } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { openOrderFor, type HackathonOrder } from "@/lib/billing";
import { formatInr, razorpayConfig } from "@/lib/razorpay";
import { createClient } from "@/lib/supabase/server";
import { renameAndReorder } from "../actions";
import { PayButton } from "./pay-button";

export const metadata: Metadata = { title: "Pay for your hackathon" };
export const dynamic = "force-dynamic";

/** Step 2: the organiser pays; the hackathon is created as soon as the payment is confirmed. */
export default async function PayPage(props: PageProps<"/start/pay">) {
  const session = await requireSession();
  if (session.profile.role !== "admin" || session.hackathonId) redirect("/staff");
  const sp = await props.searchParams;
  const config = razorpayConfig();
  const { data: last } = await (await createClient()).from("hackathon_orders").select("*").eq("profile_id", session.userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle<HackathonOrder>();

  let order: HackathonOrder | null = null;
  let problem: string | null = null;
  if (last?.status === "paid" && last.hackathon_id) redirect("/staff");
  if (last && config.enabled) {
    try {
      order = await openOrderFor({ profileId: session.userId, email: session.email ?? last.email, organiserName: session.profile.full_name ?? last.organiser_name, organisation: last.organisation, hackathonName: last.hackathon_name });
    } catch {
      problem = "We couldn't reach the payment provider. Please reload the page in a minute.";
    }
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-xl px-4 py-14">
        <p className="text-sm font-semibold text-grass">Step 2 of 2</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Pay for your hackathon</h1>
        <p className="mt-2 text-ink-soft">Your organiser account is ready. As soon as the payment goes through, your hackathon is created and you&apos;re taken to your dashboard.</p>
        <div className="mt-6"><Flash notice={sp.notice} error={sp.error} /></div>
        <Card className="mt-6 p-6 sm:p-8">
          {!config.enabled ? (
            <Alert tone="amber" title="Payments are not switched on yet">Online payment is being set up. Please come back soon or contact us.</Alert>
          ) : !last ? (
            <form action={renameAndReorder} className="space-y-4">
              <TextField label="College, club or company" name="organisation" id="p-org" required maxLength={150} />
              <TextField label="Hackathon name" name="hackathon_name" id="p-hack" required maxLength={120} />
              <SubmitButton>Continue</SubmitButton>
            </form>
          ) : (
            <div className="space-y-6">
              <dl className="divide-y divide-line-soft text-sm">
                <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Hackathon</dt><dd className="text-right font-semibold text-ink">{last.hackathon_name}</dd></div>
                <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Organisation</dt><dd className="text-right text-ink">{last.organisation}</dd></div>
                <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Admin account</dt><dd className="text-right text-ink">{session.email}</dd></div>
                <div className="flex justify-between gap-4 py-3 text-base"><dt className="font-semibold text-ink">Total (one-time)</dt><dd className="font-bold text-ink">{formatInr(order?.amount_paise ?? last.amount_paise)}</dd></div>
              </dl>
              {problem && <Alert tone="red">{problem}</Alert>}
              {order?.razorpay_order_id && (
                <PayButton keyId={config.keyId} orderId={order.razorpay_order_id} amountPaise={order.amount_paise} label={formatInr(order.amount_paise)}
                  name={session.profile.full_name ?? ""} email={session.email ?? ""} phone={session.profile.phone} hackathon={order.hackathon_name} />
              )}
              {config.testMode && <p className="text-xs text-muted">Test mode: use Razorpay&apos;s test UPI ID <span className="font-mono">success@razorpay</span> or a test card. No real money is taken.</p>}
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-grass">Change the hackathon name</summary>
                <form action={renameAndReorder} className="mt-3 space-y-3">
                  <TextField label="College, club or company" name="organisation" id="p-org2" required maxLength={150} defaultValue={last.organisation} />
                  <TextField label="Hackathon name" name="hackathon_name" id="p-hack2" required maxLength={120} defaultValue={last.hackathon_name} />
                  <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                </form>
              </details>
            </div>
          )}
        </Card>
        <form action="/auth/signout" method="post" className="mt-6 text-center">
          <button type="submit" className="text-sm text-muted hover:text-ink">Sign out</button>
        </form>
      </section>
    </PublicShell>
  );
}
