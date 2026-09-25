import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { param, type SearchParams } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { QrScanner } from "./scanner";

export const metadata: Metadata = { title: "QR Scanner" };

export default async function AttendancePage(props: PageProps<"/staff/attendance">) {
  const session = await requirePermission("record_attendance", "view_attendance");
  const sp = (await props.searchParams) as SearchParams;
  const supabase = await createClient();
  const seeAll = can(session, "view_attendance");
  const [{ count: present }, stats] = await Promise.all([
    seeAll
      ? supabase.from("attendance").select("id", { count: "exact", head: true }).eq("status", "present").eq("session_key", "main")
      : supabase.from("attendance").select("id", { count: "exact", head: true }).eq("recorded_by", session.userId).eq("status", "present"),
    can(session, "view_reports") ? supabase.rpc("dashboard_stats") : Promise.resolve({ data: null }),
  ]);
  const total = (stats.data as { participants?: number } | null)?.participants;

  return (
    <>
      <PageHeader
        title="QR Scanner"
        description="Scan a participant's ID card. You'll see who it belongs to; attendance is saved only when you confirm, with your name and the time."
        actions={<>
          {can(session, "manual_checkin") && <LinkButton href="/staff/attendance/manual" variant="secondary">Manual check-in</LinkButton>}
          <LinkButton href="/staff/attendance/history" variant="secondary">Attendance history</LinkButton>
          {seeAll && <LinkButton href="/api/reports/attendance" variant="secondary" prefetch={false}>Export CSV</LinkButton>}
        </>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={seeAll ? "Checked in (all)" : "Checked in by you"} value={present ?? 0} tone="green" />
        {total !== undefined && <Stat label="Registered participants" value={total} />}
        {total !== undefined && <Stat label="Attendance rate" value={total ? `${Math.round(((present ?? 0) / total) * 100)}%` : "—"} tone="violet" />}
      </div>
      {can(session, "record_attendance") ? (
        <QrScanner initialToken={param(sp, "token") || undefined} />
      ) : (
        <EmptyState title="QR check-in is not enabled for your account">
          You can review attendance in <Link className="underline" href="/staff/attendance/history">Attendance history</Link>.
        </EmptyState>
      )}
    </>
  );
}
