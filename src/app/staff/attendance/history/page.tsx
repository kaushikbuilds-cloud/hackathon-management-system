import type { Metadata } from "next";
import { AttendanceBadge } from "@/components/status";
import { Card, EmptyState, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { hrefWith, type SearchParams } from "@/lib/data/query";
import { parsePage } from "@/lib/domain/search";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { UndoCheckIn } from "../row-actions";

export const metadata: Metadata = { title: "Attendance History" };
const PAGE_SIZE = 50;

type LogRow = {
  id: string; status: "present" | "corrected"; method: string; checked_in_at: string; corrected_at: string | null; correction_reason: string | null;
  participant_id: string; team_id: string; recorded_by: string | null;
  recorder: { full_name: string | null } | null;
};

export default async function AttendanceHistoryPage(props: PageProps<"/staff/attendance/history">) {
  const session = await requirePermission("record_attendance", "manual_checkin", "view_attendance");
  const sp = (await props.searchParams) as SearchParams;
  const page = parsePage(sp.page);
  const supabase = await createClient();
  const tz = (await getHackathon())?.timezone ?? "UTC";
  const seeAll = can(session, "view_attendance");
  const canCorrect = can(session, "correct_attendance");

  // RLS limits this to your own check-ins unless you hold view_attendance.
  const { data, count } = await supabase
    .from("attendance")
    .select("id, status, method, checked_in_at, corrected_at, correction_reason, participant_id, team_id, recorded_by, recorder:profiles!attendance_recorded_by_fkey(full_name)", { count: "exact" })
    .order("checked_in_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<LogRow[]>();

  // Names come from the contact-free directory function, not the participants table.
  const ids = [...new Set((data ?? []).map((r) => r.participant_id))];
  const { data: names } = ids.length
    ? await supabase.rpc("attendance_names", { p_ids: ids })
    : { data: [] };
  const nameBy = new Map(((names ?? []) as { id: string; participant_code: string; full_name: string; team_name: string }[]).map((n) => [n.id, n]));

  return (
    <>
      <PageHeader title="Attendance History" description={seeAll ? "All check-ins and corrections." : "Check-ins you recorded."} />
      {!data?.length ? (
        <EmptyState title="No check-ins yet" />
      ) : (
        <Card>
          <Table caption="Attendance history">
            <thead><tr><Th>Time</Th><Th>Participant</Th><Th>Team</Th><Th>Method</Th>{seeAll && <Th>Recorded by</Th>}<Th>Status</Th>{canCorrect && <Th>Action</Th>}</tr></thead>
            <tbody className="divide-y divide-line-soft">
              {data.map((r) => {
                const n = nameBy.get(r.participant_id);
                return (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(r.checked_in_at, tz)}</Td>
                    <Td>{n?.full_name ?? "—"} <span className="font-mono text-xs text-muted">{n?.participant_code}</span></Td>
                    <Td>{n?.team_name ?? "—"}</Td>
                    <Td className="text-xs uppercase">{r.method}</Td>
                    {seeAll && <Td>{r.recorder?.full_name ?? "—"}</Td>}
                    <Td>
                      <AttendanceBadge state={r.status === "present" ? "present" : "corrected"} />
                      {r.status === "corrected" && <p className="mt-1 text-xs text-muted">{formatDateTime(r.corrected_at, tz)}: {r.correction_reason}</p>}
                    </Td>
                    {canCorrect && <Td>{r.status === "present" && <UndoCheckIn attendanceId={r.id} />}</Td>}
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(n) => hrefWith("/staff/attendance/history", sp, { page: n })} />
        </Card>
      )}
    </>
  );
}
