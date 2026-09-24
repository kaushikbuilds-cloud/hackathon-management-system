import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarList } from "@/components/bar-list";
import { Card, CardTitle, LinkButton, PageHeader, Stat } from "@/components/ui";
import { isAdmin, requireStaff } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadDashboardStats } from "@/lib/data/stats";
import { PDF_STATUS_LABEL, REGISTRATION_STATUS_LABEL, TEAM_ATTENDANCE_LABEL } from "@/lib/domain/labels";
import { SUPPORT_STATUSES, supportStatusLabel } from "@/lib/domain/support";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const SUPPORT_LABELS = Object.fromEntries(SUPPORT_STATUSES.map((s) => [s, supportStatusLabel(s)]));

export default async function DashboardPage() {
  const session = await requireStaff();
  if (!isAdmin(session)) redirect("/staff/attendance");
  const [stats, hackathon] = await Promise.all([loadDashboardStats(await createClient()), getHackathon()]);
  return (
    <>
      <PageHeader title="Dashboard" description={hackathon ? `${hackathon.name} at a glance.` : undefined} actions={<LinkButton href="/staff/reports" variant="secondary">Reports &amp; exports</LinkButton>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Registered teams" value={stats.teams} />
        <Stat label="Participants" value={stats.participants} tone="violet" />
        <Stat label="Checked in" value={`${stats.present}/${stats.participants}`} hint={stats.participants ? `${Math.round((stats.present / stats.participants) * 100)}% attendance` : undefined} tone="green" />
        <Stat label="Open support requests" value={stats.openSupport} tone="amber" hint={<Link href="/staff/support" className="underline">View queue</Link>} />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card><CardTitle>Registration status</CardTitle><BarList items={stats.registration} labels={REGISTRATION_STATUS_LABEL} /></Card>
        <Card><CardTitle>ID card PDFs</CardTitle><BarList items={stats.pdf} labels={PDF_STATUS_LABEL} /></Card>
        <Card><CardTitle>Team attendance</CardTitle><BarList items={stats.teamAttendance} labels={TEAM_ATTENDANCE_LABEL} /></Card>
        <Card><CardTitle>Teams by college</CardTitle><BarList items={stats.teamsByCollege} /></Card>
        <Card><CardTitle>Participants by department</CardTitle><BarList items={stats.participantsByDepartment} /></Card>
        <Card><CardTitle>Support requests</CardTitle><BarList items={stats.support} labels={SUPPORT_LABELS} /></Card>
      </div>
    </>
  );
}
