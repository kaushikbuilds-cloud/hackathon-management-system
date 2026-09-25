import type { Metadata } from "next";
import { ConfirmSubmit } from "@/components/client";
import { Alert, Card, CardTitle, Flash, LinkButton, PageHeader, Stat, TextField } from "@/components/ui";
import { isSuperAdmin, requirePermission } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";
import type { Hackathon } from "@/lib/types";
import { exportLink } from "@/lib/deliver";
import { latestHackathonExport } from "@/lib/export";
import { SubmitButton } from "@/components/client";
import { endHackathon, prepareFullExport, reopenHackathon } from "./actions";

export const metadata: Metadata = { title: "End Hackathon" };

// Preparing the full export can take a while for big events.
export const maxDuration = 300;

/** Rows of a hackathon's table, optionally where `column` is one of `values`. */
async function count(table: string, hackathonId: string, column?: string, values?: string[]): Promise<number> {
  let q = createServiceClient().from(table).select("hackathon_id", { count: "exact", head: true }).eq("hackathon_id", hackathonId);
  if (column && values) q = q.in(column, values);
  return (await q).count ?? 0;
}

/** Wrap up: a last check, the End button, and the full data download. */
export default async function EndHackathonPage(props: PageProps<"/staff/end">) {
  const session = await requirePermission("manage_event");
  const sp = await props.searchParams;
  const { data: h } = await createServiceClient().from("hackathons").select("*").eq("id", session.hackathonId).single<Hackathon>();
  const id = session.hackathonId;
  const [teams, pendingPayments, openOrders, openSupport, checkedIn, certificates] = await Promise.all([
    count("teams", id),
    count("teams", id, "payment_status", ["submitted"]),
    count("food_orders", id, "status", ["placed", "preparing", "ready"]),
    count("support_requests", id, "status", ["new", "assigned", "in_progress"]),
    count("attendance", id, "status", ["present"]),
    count("certificate_recipients", id),
  ]);
  const ended = h?.status === "completed";
  const latest = await latestHackathonExport(id);
  const links = latest ? await Promise.all(latest.parts.map(async (p) => ({ ...p, url: await exportLink(p.path, p.name) }))) : [];
  const stampLabel = latest ? `${latest.stamp.slice(6, 8)}/${latest.stamp.slice(4, 6)}/${latest.stamp.slice(0, 4)} ${latest.stamp.slice(9, 11)}:${latest.stamp.slice(11, 13)} UTC` : "";

  return (
    <>
      <PageHeader title="End Hackathon" description="When the event is over, end it here and download everything it produced as one ZIP file." />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Teams" value={teams} />
        <Stat label="Checked in" value={checkedIn} tone="green" hint={`${certificates} certificates`} />
        <Stat label="Still open" value={pendingPayments + openOrders + openSupport} tone="amber" hint={`${pendingPayments} payments to check · ${openOrders} food orders · ${openSupport} support requests`} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          {ended ? (
            <>
              <CardTitle description={h?.ended_at ? `Ended ${formatDateTime(h.ended_at, h.timezone)}.` : undefined}>This hackathon has ended</CardTitle>
              <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-ink">
                <li>Registration forms and food shops are closed.</li>
                <li>Team IDs, passwords, activation codes, ID card QR codes and shop logins no longer work.</li>
                <li>Certificates: download them on the <a href="/staff/certificates" className="font-bold text-brand underline">Certificates</a> page and send them to the teams.</li>
              </ul>
              {isSuperAdmin(session) && (
                <form action={reopenHackathon.bind(null, id)}>
                  <ConfirmSubmit variant="secondary" message="Reopen this hackathon?">Reopen (platform owner)</ConfirmSubmit>
                </form>
              )}
            </>
          ) : (
            <>
              <CardTitle description="Do this after the last result is announced.">End the hackathon</CardTitle>
              <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-ink">
                <li>Closes every registration form and food shop.</li>
                <li>Stops every Team ID and password, activation code, ID card QR code and shop login. Teams are signed out straight away.</li>
                <li>Staff keep access to download the data and certificates (set awards and signatures on the <a href="/staff/certificates" className="font-bold text-brand underline">Certificates</a> page). Only the platform owner can reopen it.</li>
              </ul>
              {pendingPayments + openOrders + openSupport > 0 && (
                <div className="mb-4"><Alert tone="amber" title="Some things are still open">{pendingPayments} payments to check, {openOrders} food orders, {openSupport} support requests. You can still end the hackathon.</Alert></div>
              )}
              <form action={endHackathon} className="space-y-3">
                <TextField label="Type END to confirm" name="confirm" id="confirm-end" required maxLength={10} autoComplete="off" />
                <ConfirmSubmit variant="danger" message={`End ${h?.name ?? "this hackathon"} now?`}>End hackathon</ConfirmSubmit>
              </form>
            </>
          )}
        </Card>
        <Card>
          <CardTitle description="Spreadsheets of all data, every uploaded file and every certificate, named by Team ID and Participant ID.">Full data download</CardTitle>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-ink">
            <li><strong>data/</strong>: teams, participants, attendance, payments, food orders and menus, support, announcements, schedule, FAQ, forms and submissions, logins, audit log (CSV)</li>
            <li><strong>files/</strong>: payment proofs, ID card PDFs, photos, support attachments, logos and signatures</li>
            <li><strong>certificates/</strong>: a PDF for every certificate, a folder per team</li>
          </ul>
          <form action={prepareFullExport}>
            <SubmitButton variant={ended ? "primary" : "secondary"} pendingText="Preparing… (this can take a minute)">{ended ? "Prepare full data download" : "Prepare a backup now"}</SubmitButton>
          </form>
          {links.length > 0 && (
            <div className="mt-4 rounded-md border-2 border-line bg-paper-2 p-3">
              <p className="text-sm font-bold text-ink">Latest export · {stampLabel}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {links.map((l) => (
                  <li key={l.path}>{l.url ? <a href={l.url} className="font-bold text-brand underline-offset-4 hover:underline">{l.name}</a> : l.name} <span className="text-muted">({(l.size / 1024 / 1024).toFixed(1)} MB)</span></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Links work for an hour; reload this page for fresh links. Big events come in parts (spreadsheets and certificates are in part 1).</p>
            </div>
          )}
          <div className="mt-4"><LinkButton href="/staff/certificates" variant="secondary" size="sm">Certificates</LinkButton></div>
        </Card>
      </div>
    </>
  );
}
