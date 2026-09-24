import { AnnouncementFeed } from "@/components/announcements";
import { AttendanceBadge, RegistrationBadge } from "@/components/status";
import { Badge, Card, CardTitle, DescriptionList, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadAnnouncementsAndSchedule, loadMyTeam } from "@/lib/data/portal";
import { formatDateTime } from "@/lib/format";

export default async function PortalHome() {
  const session = await requireParticipant();
  const [data, hackathon, feed] = await Promise.all([loadMyTeam(), getHackathon(), loadAnnouncementsAndSchedule(5)]);
  if (!data) return <EmptyState title="Team not found">Your account is not linked to a team. Contact the organisers.</EmptyState>;
  const { team, members } = data;
  const me = members.find((m) => m.id === session.participantId);
  const tz = hackathon?.timezone ?? "UTC";

  return (
    <>
      <PageHeader title={team.name} description={<span className="font-mono">{team.team_code}</span>} actions={<LinkButton href="/portal/support/new">Get help</LinkButton>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle>Team details</CardTitle>
          <DescriptionList items={[
            { label: "Team ID", value: <span className="font-mono">{team.team_code}</span> },
            { label: "Registration", value: <RegistrationBadge status={team.status} /> },
            { label: "College", value: team.college },
            { label: "Registered", value: formatDateTime(team.created_at, tz) },
            ...(me ? [{ label: "Your Participant ID", value: <span className="font-mono">{me.participant_code}</span> }, { label: "Your attendance", value: <AttendanceBadge state={me.attendance_state} /> }] : []),
          ]} />
          {team.status === "rejected" && team.status_reason && <p className="mt-4 text-sm text-red-200">Note from organisers: {team.status_reason}</p>}
          <h3 className="mt-6 mb-3 text-sm font-semibold text-slate-200">Members</h3>
          <Table caption="Team members">
            <thead><tr><Th>Participant ID</Th><Th>Name</Th><Th>Role</Th><Th>Email</Th><Th>Department</Th><Th>Attendance</Th></tr></thead>
            <tbody className="divide-y divide-navy-800">
              {members.map((m) => (
                <tr key={m.id}>
                  <Td className="font-mono text-xs">{m.participant_code}</Td>
                  <Td className="font-medium">{m.full_name}{m.id === session.participantId && <span className="ml-1 text-xs text-slate-400">(you)</span>}</Td>
                  <Td>{m.role === "leader" ? <Badge tone="violet">Leader</Badge> : "Member"}</Td>
                  <Td className="break-all">{m.email}</Td>
                  <Td>{m.department ?? "—"}</Td>
                  <Td><AttendanceBadge state={m.attendance_state} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-slate-400">Spotted a mistake? Raise a support request under “Registration” and the organisers will correct it.</p>
        </Card>
        <div className="space-y-6">
          <AnnouncementFeed items={feed.announcements} timeZone={tz} title="Latest announcements" />
          {hackathon?.support_instructions && (
            <Card><CardTitle>Need help?</CardTitle><p className="whitespace-pre-line text-sm text-slate-300">{hackathon.support_instructions}</p></Card>
          )}
        </div>
      </div>
    </>
  );
}
