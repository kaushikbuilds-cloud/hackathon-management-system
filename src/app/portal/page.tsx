import { AnnouncementFeed } from "@/components/announcements";
import { SubmitButton } from "@/components/client";
import { AttendanceBadge, PaymentBadge, RegistrationBadge } from "@/components/status";
import { Badge, Card, CardTitle, DescriptionList, EmptyState, Flash, LinkButton, PageHeader, Table, Td, TextField, Th, buttonClass } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadAnnouncementsAndSchedule, loadMyTeam } from "@/lib/data/portal";
import { formatRupees } from "@/lib/domain/fees";
import { formatDateTime } from "@/lib/format";
import { resubmitPayment } from "./payment-actions";

export default async function PortalHome(props: PageProps<"/portal">) {
  const sp = await props.searchParams;
  const session = await requireParticipant();
  const [data, hackathon, feed] = await Promise.all([loadMyTeam(session.participantId, session.isTeamAccount), getHackathon(), loadAnnouncementsAndSchedule(5)]);
  if (!data) return <EmptyState title="Team not found">Your account is not linked to a team. Contact the organisers.</EmptyState>;
  const { team, roster, me, isLeader, members } = data;
  const tz = hackathon?.timezone ?? "UTC";
  const cards = Boolean(hackathon?.portal_id_cards);

  return (
    <>
      <PageHeader
        title={team.name}
        description={<span><span className="font-mono">{team.team_code}</span> · {session.isTeamAccount ? "Team dashboard" : isLeader ? "Team Leader dashboard" : "Participant dashboard"}</span>}
        actions={<>
          {cards && !session.isTeamAccount && <a href="/api/portal/id-card?scope=me" className={buttonClass("secondary")}>My ID card</a>}
          {cards && isLeader && <a href="/api/portal/id-card?scope=team" className={buttonClass("secondary")}>Team ID cards PDF</a>}
          <LinkButton href="/portal/support/new">Get help</LinkButton>
        </>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardTitle>{isLeader ? "Team & registration" : "My registration"}</CardTitle>
            <DescriptionList items={[
              { label: "Team ID", value: <span className="font-mono">{team.team_code}</span> },
              { label: "Registration status", value: <RegistrationBadge status={team.status} /> },
              ...((team.payment_status ?? "not_required") !== "not_required" ? [{
                label: "Registration fee",
                value: <span className="inline-flex flex-wrap items-center gap-2"><PaymentBadge status={team.payment_status} />{team.payment_amount != null && <span>{formatRupees(Number(team.payment_amount))}</span>}</span>,
              }] : []),
              ...(me ? [
                { label: "My Participant ID", value: <span className="font-mono">{me.participant_code}</span> },
                { label: "My role", value: me.role === "leader" ? "Team Leader" : "Member" },
                { label: "My attendance", value: <AttendanceBadge state={me.attendance_state} /> },
              ] : []),
              { label: "College", value: team.college },
              { label: "Registered", value: formatDateTime(team.created_at, tz) },
            ]} />
            {team.status_reason && team.status !== "approved" && <p className="mt-4 text-sm text-warn">Note from organisers: {team.status_reason}</p>}
            {team.payment_status === "rejected" && (
              <div className="mt-4 rounded-md border-2 border-line bg-danger-tint p-4">
                <p className="font-bold text-ink">Your payment was not accepted</p>
                {team.payment_note && <p className="mt-1 text-sm text-ink-soft">{team.payment_note}</p>}
                {isLeader ? (
                  <form action={resubmitPayment} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <TextField label="UPI transaction ID (UTR)" name="payment_utr" required maxLength={40} autoComplete="off" />
                    <div className="space-y-1.5">
                      <label htmlFor="payment_proof" className="block text-sm font-bold text-ink">Payment screenshot</label>
                      <input id="payment_proof" name="payment_proof" type="file" required accept="image/png,image/jpeg,application/pdf"
                        className="block w-full cursor-pointer text-sm text-ink-soft file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-2 file:border-line file:bg-surface file:px-3 file:font-bold file:text-ink" />
                    </div>
                    <SubmitButton pendingText="Submitting…">Resubmit</SubmitButton>
                  </form>
                ) : (
                  <p className="mt-1 text-sm text-ink-soft">Your Team Leader can resubmit the payment.</p>
                )}
              </div>
            )}
            {!cards && <p className="mt-4 text-xs text-muted">ID cards will be available here once the organisers enable them.</p>}
          </Card>

          <Card>
            <CardTitle description={isLeader ? "As Team Leader you can see member details. Need a correction? Raise a request." : undefined}
              actions={isLeader && <LinkButton href="/portal/support/new?category=registration" variant="secondary" size="sm">Request a change</LinkButton>}>
              Team members
            </CardTitle>
            {isLeader ? (
              <Table caption="Team members">
                <thead><tr><Th>Participant ID</Th><Th>Name</Th><Th>Role</Th><Th>Email</Th><Th>Phone</Th><Th>Attendance</Th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <Td className="font-mono text-xs">{m.participant_code}</Td>
                      <Td className="font-medium">{m.full_name}{m.id === session.participantId && <span className="ml-1 text-xs text-muted">(you)</span>}</Td>
                      <Td>{m.role === "leader" ? <Badge tone="violet">Leader</Badge> : "Member"}</Td>
                      <Td className="break-all">{m.email}</Td>
                      <Td className="whitespace-nowrap">{m.phone ?? "—"}</Td>
                      <Td><AttendanceBadge state={m.attendance_state} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <ul className="divide-y divide-line-soft">
                {roster.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>{m.full_name}{m.id === session.participantId && <span className="ml-1 text-xs text-muted">(you)</span>} {m.role === "leader" && <Badge tone="violet">Leader</Badge>}</span>
                    <span className="font-mono text-xs text-muted">{m.participant_code}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <AnnouncementFeed items={feed.announcements} timeZone={tz} title="Latest announcements" />
          {hackathon?.support_instructions && (
            <Card><CardTitle>Need help?</CardTitle><p className="whitespace-pre-line text-sm text-ink-soft">{hackathon.support_instructions}</p></Card>
          )}
        </div>
      </div>
    </>
  );
}
