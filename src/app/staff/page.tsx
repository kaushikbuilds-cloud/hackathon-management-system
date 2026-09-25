import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/bar-list";
import { Card, CardTitle, DescriptionList, LinkButton, PageHeader, Stat, buttonClass } from "@/components/ui";
import { can, isSuperAdmin, portalName, requireStaff, type Session } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadDashboardStats } from "@/lib/data/stats";
import { PDF_STATUS_LABEL, REGISTRATION_STATUS_LABEL, TEAM_ATTENDANCE_LABEL } from "@/lib/domain/labels";
import { SUPPORT_STATUSES, supportStatusLabel } from "@/lib/domain/support";
import { formatDateTime } from "@/lib/format";
import { permissionLabel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { OfficialAssignment } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

const SUPPORT_LABELS = Object.fromEntries(SUPPORT_STATUSES.map((s) => [s, supportStatusLabel(s)]));

export default async function DashboardPage() {
  const session = await requireStaff();
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  return (
    <>
      <PageHeader title="Dashboard" description={`${portalName(session)} · ${hackathon?.name ?? "Hackathon"}`} />
      {can(session, "view_reports") ? <Overview tz={tz} superAdmin={isSuperAdmin(session)} /> : <WorkDashboard session={session} tz={tz} />}
    </>
  );
}

async function Overview({ tz, superAdmin }: { tz: string; superAdmin: boolean }) {
  const stats = await loadDashboardStats(await createClient());
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Registered teams" value={stats.teams} hint={stats.pendingApprovals ? <Link href="/staff/teams?status=pending" className="underline">{stats.pendingApprovals} pending approval</Link> : "No pending approvals"} />
        <Stat label="Participants" value={stats.participants} tone="violet" />
        <Stat label="Checked in" value={`${stats.present}/${stats.participants}`} hint={stats.participants ? `${Math.round((stats.present / stats.participants) * 100)}% attendance` : undefined} tone="green" />
        <Stat label="Open support requests" value={stats.openSupport} tone="amber" hint={<Link href="/staff/support" className="underline">View queue</Link>} />
      </div>
      {superAdmin && (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Active staff" value={stats.staff} hint={<Link href="/staff/users/admins" className="underline">User Management</Link>} />
          <Stat label="Pending invitations" value={stats.pendingInvitations} tone="violet" />
        </div>
      )}
      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card><CardTitle>Registration status</CardTitle><BarList items={stats.registration} labels={REGISTRATION_STATUS_LABEL} /></Card>
        <Card><CardTitle>ID card PDF jobs</CardTitle><BarList items={stats.pdf} labels={PDF_STATUS_LABEL} /></Card>
        <Card><CardTitle>Team attendance</CardTitle><BarList items={stats.teamAttendance} labels={TEAM_ATTENDANCE_LABEL} /></Card>
        <Card><CardTitle>Teams by college</CardTitle><BarList items={stats.teamsByCollege} /></Card>
        <Card><CardTitle>Participants by department</CardTitle><BarList items={stats.participantsByDepartment} /></Card>
        <Card><CardTitle>Support requests</CardTitle><BarList items={stats.support} labels={SUPPORT_LABELS} /></Card>
      </div>
      {stats.recentActivity.length > 0 && (
        <Card className="mt-6">
          <CardTitle actions={superAdmin && <LinkButton href="/staff/audit" variant="secondary" size="sm">Audit Logs</LinkButton>}>Recent activity</CardTitle>
          <ul className="divide-y divide-navy-800 text-sm">
            {stats.recentActivity.map((a, i) => (
              <li key={i} className="flex justify-between gap-3 py-2"><span className="font-mono text-xs text-slate-200">{a.action}</span><span className="text-xs text-slate-400">{formatDateTime(a.at, tz)}</span></li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/** Dashboard for staff without report access (typically Officials): duties and quick actions. */
async function WorkDashboard({ session, tz }: { session: Session; tz: string }) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ data: assignment }, { count: myCheckins }, { count: myRequests }] = await Promise.all([
    supabase.from("official_assignments").select("*").eq("profile_id", session.userId).maybeSingle<OfficialAssignment>(),
    supabase.from("attendance").select("id", { count: "exact", head: true }).eq("recorded_by", session.userId).gte("checked_in_at", since),
    supabase.from("support_requests").select("id", { count: "exact", head: true }).eq("assigned_to", session.userId).not("status", "in", "(resolved,closed)"),
  ]);
  const actions = [
    { href: "/staff/attendance", label: "Scan QR codes", show: can(session, "record_attendance") },
    { href: "/staff/attendance/manual", label: "Manual check-in", show: can(session, "manual_checkin") },
    { href: "/staff/attendance/history", label: "My check-in history", show: true },
    { href: "/staff/support", label: "Help desk", show: true },
    { href: "/staff/id-cards", label: "ID cards", show: can(session, "generate_pdf") },
  ].filter((a) => a.show);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>Your assignment</CardTitle>
        <DescriptionList items={[
          { label: "Duty", value: assignment?.duty ?? "Not assigned yet" },
          { label: "Station", value: assignment?.station ?? "—" },
          { label: "Permissions", value: [...session.permissions].map(permissionLabel).join(", ") || "None" },
          { label: "Signed in as", value: session.email },
        ]} />
      </Card>
      <div className="grid grid-cols-2 gap-4 content-start">
        <Stat label="Your check-ins (24 h)" value={myCheckins ?? 0} tone="green" />
        <Stat label="Your open help-desk requests" value={myRequests ?? 0} tone="amber" />
      </div>
      <Card className="lg:col-span-2">
        <CardTitle>Quick actions</CardTitle>
        <div className="flex flex-wrap gap-3">
          {actions.map((a) => <Link key={a.href} href={a.href} className={buttonClass(a.href === "/staff/attendance" ? "primary" : "secondary")}>{a.label}</Link>)}
        </div>
        <p className="mt-4 text-xs text-slate-400">Times shown in {tz}.</p>
      </Card>
    </div>
  );
}
