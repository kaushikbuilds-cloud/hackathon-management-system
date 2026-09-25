import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, DescriptionList, Flash, PageHeader, SelectField, Stat, Table, Td, Th } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { HACKATHON_STATUS_LABEL, HACKATHON_STATUS_TONE, loadPlatformOverview } from "@/lib/data/platform";
import { formatDateTime } from "@/lib/format";
import { invitationState } from "@/lib/invitations";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Hackathon, Invitation, Profile } from "@/lib/types";
import { openHackathon, setHackathonStatus } from "../actions";
import { InviteAdminForm } from "./invite-admin-form";

export const metadata: Metadata = { title: "Hackathon" };

export default async function HackathonDetailPage(props: PageProps<"/staff/hackathons/[id]">) {
  await requireSuperAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const service = createServiceClient();
  const [{ data: h }, { data: admins }, { data: invites }, overview] = await Promise.all([
    service.from("hackathons").select("*").eq("id", id).maybeSingle<Hackathon>(),
    service.from("profiles").select("*").eq("hackathon_id", id).in("role", ["admin", "official"]).order("role").order("full_name").returns<Profile[]>(),
    service.from("invitations").select("*").eq("hackathon_id", id).eq("role", "admin").eq("purpose", "activate").order("created_at", { ascending: false }).limit(20).returns<Invitation[]>(),
    loadPlatformOverview(await createClient()),
  ]);
  if (!h) notFound();
  const stats = overview.find((r) => r.id === id);
  const tz = h.timezone;

  return (
    <>
      <PageHeader
        back={{ href: "/staff/hackathons", label: "Hackathons" }}
        title={h.name}
        description={h.organizer_name ?? undefined}
        actions={
          <form action={openHackathon.bind(null, h.id)}>
            <SubmitButton pendingText="Opening…">Open this hackathon</SubmitButton>
          </form>
        }
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Teams" value={stats?.teams ?? 0} />
        <Stat label="Participants" value={stats?.participants ?? 0} tone="violet" />
        <Stat label="Checked in" value={stats?.present ?? 0} tone="green" />
        <Stat label="Open support" value={stats?.open_support ?? 0} tone="amber" />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[1fr_26rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Details</CardTitle>
            <DescriptionList items={[
              { label: "Status", value: <Badge tone={HACKATHON_STATUS_TONE[h.status]}>{HACKATHON_STATUS_LABEL[h.status]}</Badge> },
              { label: "Public page", value: <Link className="underline" href={`/h/${h.slug}`}>/h/{h.slug}</Link> },
              { label: "Starts", value: formatDateTime(h.starts_at, tz) },
              { label: "Ends", value: formatDateTime(h.ends_at, tz) },
              { label: "Venue", value: h.venue ?? "—" },
              { label: "Contact", value: h.contact_email ?? "—" },
              { label: "Last activity", value: stats?.last_activity ? formatDateTime(stats.last_activity, tz) : "—" },
            ]} />
            <form action={setHackathonStatus.bind(null, h.id)} className="mt-4 flex flex-wrap items-end gap-3">
              <SelectField label="Change status" name="status" defaultValue={h.status} options={Object.entries(HACKATHON_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
              <SubmitButton variant="secondary" pendingText="Saving…">Save status</SubmitButton>
            </form>
            <p className="mt-2 text-xs text-muted">Only Active hackathons are listed on the public home page. Archived hackathons have no public page.</p>
          </Card>
          <Card className="p-0">
            <div className="p-5 pb-0"><CardTitle>Staff</CardTitle></div>
            {!admins?.length ? (
              <p className="p-5 text-sm text-muted">No staff accounts yet. Invite the organiser as Admin.</p>
            ) : (
              <Table caption="Staff of this hackathon">
                <thead><tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th></tr></thead>
                <tbody>
                  {admins.map((p) => (
                    <tr key={p.id}>
                      <Td><div className="font-medium text-ink">{p.full_name ?? "—"}</div><div className="text-xs text-muted">{p.email}</div></Td>
                      <Td className="capitalize">{p.role}</Td>
                      <Td><Badge tone={p.status === "active" ? "green" : "amber"}>{p.status}</Badge></Td>
                      <Td className="text-xs">{p.last_sign_in_at ? formatDateTime(p.last_sign_in_at, tz) : "Never"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle description="Full Admin access to this hackathon only, including inviting their own Officials.">Invite Admin</CardTitle>
            <InviteAdminForm hackathonId={h.id} eventName={h.name} />
          </Card>
          {invites && invites.length > 0 && (
            <Card>
              <CardTitle>Admin invitations</CardTitle>
              <ul className="space-y-2 text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span className="truncate text-ink">{i.email}</span>
                    <Badge tone={invitationState(i) === "accepted" ? "green" : invitationState(i) === "pending" ? "blue" : "neutral"}>{invitationState(i)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
