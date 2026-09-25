import type { Metadata } from "next";
import { BarList } from "@/components/bar-list";
import { Card, CardTitle, PageHeader, buttonClass } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { loadDashboardStats } from "@/lib/data/stats";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

const EXPORTS = [
  { kind: "teams", title: "Teams", text: "One row per team with leader, size, status, attendance and PDF status." },
  { kind: "participants", title: "Participants", text: "All members with Participant ID, team, contact details and attendance." },
  { kind: "attendance", title: "Attendance log", text: "Every check-in and correction with official and timestamps." },
  { kind: "team-attendance", title: "Team-wise attendance", text: "Present / total per team." },
  { kind: "support", title: "Support requests", text: "Requests with category, status, assignee and timestamps." },
  { kind: "submissions", title: "Registration submissions", text: "Accepted and rejected submissions with error codes." },
  { kind: "audit", title: "Audit log", text: "Latest 5,000 audited actions." },
];

export default async function ReportsPage() {
  await requirePermission("view_reports");
  const stats = await loadDashboardStats(await createClient());
  return (
    <>
      <PageHeader title="Reports" description="CSV exports open in Excel, Numbers or Google Sheets. Cells are protected against formula injection." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EXPORTS.map((e) => (
          <Card key={e.kind}>
            <CardTitle description={e.text}>{e.title}</CardTitle>
            <a href={`/api/reports/${e.kind}`} className={buttonClass("secondary", "sm")} download>Download CSV</a>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card><CardTitle>Teams by college</CardTitle><BarList items={stats.teamsByCollege} max={15} /></Card>
        <Card><CardTitle>Participants by department</CardTitle><BarList items={stats.participantsByDepartment} max={15} /></Card>
      </div>
    </>
  );
}
