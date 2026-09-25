import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Flash, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { requireSuperAdmin } from "@/lib/auth";
import { HACKATHON_STATUS_LABEL, HACKATHON_STATUS_TONE, loadPlatformOverview } from "@/lib/data/platform";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { openHackathon } from "./actions";
import { CreateHackathonForm } from "./create-form";

export const metadata: Metadata = { title: "Hackathons" };

export default async function HackathonsPage(props: PageProps<"/staff/hackathons">) {
  await requireSuperAdmin();
  const sp = await props.searchParams;
  const rows = await loadPlatformOverview(await createClient());
  const total = (k: "teams" | "participants" | "staff") => rows.reduce((n, r) => n + r[k], 0);

  return (
    <>
      <PageHeader title="Hackathons" description="Every hackathon on the platform. Open one to see it the way its Admin does." />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Hackathons" value={rows.length} hint={`${rows.filter((r) => r.status === "active").length} active`} />
        <Stat label="Teams" value={total("teams")} tone="violet" />
        <Stat label="Participants" value={total("participants")} tone="green" />
        <Stat label="Staff accounts" value={total("staff")} tone="amber" />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[1fr_28rem]">
        <Card className="p-0">
          {rows.length === 0 ? (
            <div className="p-5"><EmptyState title="No hackathons yet">Create the first one for an organiser.</EmptyState></div>
          ) : (
            <Table caption="Hackathons">
              <thead>
                <tr><Th>Hackathon</Th><Th>Status</Th><Th>Dates</Th><Th className="text-right">Teams</Th><Th className="text-right">Participants</Th><Th className="text-right">Staff</Th><Th><span className="sr-only">Actions</span></Th></tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id}>
                    <Td>
                      <Link href={`/staff/hackathons/${h.id}`} className="font-semibold text-white hover:underline">{h.name}</Link>
                      {h.organizer_name && <div className="text-xs text-slate-400">{h.organizer_name}</div>}
                    </Td>
                    <Td><Badge tone={HACKATHON_STATUS_TONE[h.status]}>{HACKATHON_STATUS_LABEL[h.status]}</Badge></Td>
                    <Td className="whitespace-nowrap text-xs">{h.starts_at ? formatDate(h.starts_at) : "—"}</Td>
                    <Td className="text-right tabular-nums">{h.teams}</Td>
                    <Td className="text-right tabular-nums">{h.participants}</Td>
                    <Td className="text-right tabular-nums">{h.staff}</Td>
                    <Td>
                      <form action={openHackathon.bind(null, h.id)}>
                        <SubmitButton size="sm" variant="secondary" pendingText="Opening…">Open</SubmitButton>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <CreateHackathonForm />
      </div>
    </>
  );
}
