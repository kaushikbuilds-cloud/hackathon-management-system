import type { Metadata } from "next";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, CardTitle, EmptyState, Flash, PageHeader, Stat, Table, Td, TextField, Th } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { hackathonPricePaise, type HackathonOrder } from "@/lib/billing";
import { formatDateTime } from "@/lib/format";
import { formatInr, razorpayConfig } from "@/lib/razorpay";
import { createServiceClient } from "@/lib/supabase/server";
import { saveHackathonPrice } from "./actions";

export const metadata: Metadata = { title: "Payments" };

const STATUS = { paid: { label: "Paid", tone: "green" }, pending: { label: "Not paid", tone: "amber" }, failed: { label: "Replaced", tone: "neutral" } } as const;

/** Hackathons bought by organisers (Razorpay), and the price. */
export default async function PaymentsPage(props: PageProps<"/staff/payments">) {
  await requireSuperAdmin();
  const sp = await props.searchParams;
  const [price, { data: orders }] = await Promise.all([
    hackathonPricePaise(),
    createServiceClient().from("hackathon_orders").select("*").order("created_at", { ascending: false }).limit(200).returns<HackathonOrder[]>(),
  ]);
  const rows = orders ?? [];
  const paid = rows.filter((o) => o.status === "paid");
  const revenue = paid.reduce((n, o) => n + o.amount_paise, 0);
  const waiting = rows.filter((o) => o.status === "pending").length;
  const rz = razorpayConfig();

  return (
    <>
      <PageHeader title="Payments" description="Organisers sign up at /start and pay for their hackathon with Razorpay. The hackathon is created as soon as the payment is confirmed." />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Revenue (shown here)" value={formatInr(revenue)} tone="green" icon={<Icon name="receipt" className="size-5" />} hint="Before Razorpay fees and GST" />
        <Stat label="Hackathons sold" value={paid.length} tone="violet" icon={<Icon name="trophy" className="size-5" />} />
        <Stat label="Signed up, not paid" value={waiting} tone="amber" icon={<Icon name="history" className="size-5" />} />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle description="What organisers pay for one hackathon (one-time).">Price</CardTitle>
          <form action={saveHackathonPrice} className="flex flex-wrap items-end gap-3">
            <TextField label="Price in ₹" name="price" id="price" type="number" min={1} max={1000000} step="1" required defaultValue={String(price / 100)} className="max-w-48" />
            <SubmitButton>Save price</SubmitButton>
          </form>
        </Card>
        <Card>
          <CardTitle>Razorpay</CardTitle>
          {!rz.enabled ? (
            <Alert tone="amber" title="Not connected">Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel → Settings → Environment Variables, then redeploy.</Alert>
          ) : (
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Badge tone={rz.testMode ? "amber" : "green"}>{rz.testMode ? "Test mode" : "Live"}</Badge> Key {rz.keyId.slice(0, 12)}…</li>
              <li className="flex items-center gap-2"><Badge tone={rz.webhookSecret ? "green" : "amber"}>{rz.webhookSecret ? "Webhook on" : "No webhook secret"}</Badge>
                <span className="text-ink-soft">{rz.webhookSecret ? "Payments complete even if the organiser closes the page." : "Add RAZORPAY_WEBHOOK_SECRET (see README) as a safety net."}</span></li>
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <CardTitle>Orders</CardTitle>
        {rows.length === 0 ? <EmptyState title="No orders yet">Orders appear when organisers sign up at /start.</EmptyState> : (
          <Table caption="Hackathon orders">
            <thead><tr><Th>Date</Th><Th>Hackathon</Th><Th>Organiser</Th><Th>Amount</Th><Th>Status</Th><Th>Razorpay</Th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <Td className="whitespace-nowrap text-ink-soft">{formatDateTime(o.paid_at ?? o.created_at, "Asia/Kolkata")}</Td>
                  <Td><span className="font-semibold text-ink">{o.hackathon_name}</span><span className="block text-xs text-muted">{o.organisation}</span></Td>
                  <Td>{o.organiser_name}<span className="block text-xs text-muted">{o.email}</span></Td>
                  <Td className="whitespace-nowrap font-semibold tabular-nums">{formatInr(o.amount_paise)}</Td>
                  <Td><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge></Td>
                  <Td className="font-mono text-xs text-muted">{o.razorpay_payment_id ?? o.razorpay_order_id ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
