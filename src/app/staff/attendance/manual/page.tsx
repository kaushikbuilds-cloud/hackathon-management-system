import type { Metadata } from "next";
import { AttendanceBadge } from "@/components/status";
import { Card, EmptyState, PageHeader, buttonClass, inputClass } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { param, type SearchParams } from "@/lib/data/query";
import type { AttendanceState } from "@/lib/domain/labels";
import { sanitizeSearch } from "@/lib/domain/search";
import { createClient } from "@/lib/supabase/server";
import { ManualCheckInButton, UndoCheckIn } from "../row-actions";

export const metadata: Metadata = { title: "Manual Check-in" };

type Row = {
  id: string; participant_code: string; full_name: string; role: string; college: string | null; department: string | null;
  team_name: string; team_code: string; team_status: string; attendance_id: string | null; attendance_state: AttendanceState;
};

export default async function ManualCheckInPage(props: PageProps<"/staff/attendance/manual">) {
  const session = await requirePermission("manual_checkin");
  const sp = (await props.searchParams) as SearchParams;
  const q = sanitizeSearch(param(sp, "q"), 60);
  // Contact-free lookup RPC: Officials never receive emails or phone numbers.
  const { data, error } = q ? await (await createClient()).rpc("lookup_participants", { p_query: q }) : { data: null, error: null };
  const rows = (data ?? []) as Row[];
  const canCorrect = can(session, "correct_attendance");

  return (
    <>
      <PageHeader title="Manual Check-in" description="For damaged or forgotten cards. Search by name, Participant ID, team name, Team ID or exact email." />
      <Card className="mb-4 p-4">
        <form className="flex gap-2" role="search">
          <label htmlFor="mq" className="sr-only">Search participants</label>
          <input id="mq" name="q" defaultValue={param(sp, "q")} className={inputClass} placeholder="Name, Participant ID or team" minLength={2} />
          <button className={buttonClass("primary")} type="submit">Search</button>
        </form>
      </Card>
      {!q ? (
        <p className="text-sm text-muted">Enter at least two characters.</p>
      ) : error ? (
        <EmptyState title="Search failed">{error.message}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No matching participants">Check the spelling, or send the person to the help desk.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-line-soft">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{p.full_name} <span className="font-mono text-xs text-muted">{p.participant_code}</span></p>
                  <p className="text-xs text-muted">
                    {p.team_name} · {p.team_code} · {p.role === "leader" ? "Team Leader" : "Member"}
                    {p.college && ` · ${p.college}`}
                    {p.team_status !== "approved" && <span className="text-warn"> · registration {p.team_status}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <AttendanceBadge state={p.attendance_state} />
                  {p.attendance_state !== "present" && p.team_status !== "rejected" && <ManualCheckInButton participantId={p.id} name={p.full_name} />}
                  {p.attendance_state === "present" && p.attendance_id && canCorrect && <UndoCheckIn attendanceId={p.attendance_id} />}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
