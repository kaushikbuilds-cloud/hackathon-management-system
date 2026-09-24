import type { Metadata } from "next";
import Link from "next/link";
import { AttendanceBadge } from "@/components/status";
import { Card, CardTitle, EmptyState, LinkButton, PageHeader, Stat, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";
import { can, requireStaff } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { param, type SearchParams } from "@/lib/data/query";
import { sanitizeSearch } from "@/lib/domain/search";
import { formatDateTime, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ParticipantOverview } from "@/lib/types";
import { ManualCheckInButton, UndoCheckIn } from "./row-actions";
import { QrScanner } from "./scanner";

export const metadata: Metadata = { title: "Attendance" };

type LogRow = {
  id: string; status: "present" | "corrected"; method: string; checked_in_at: string; corrected_at: string | null; correction_reason: string | null;
  participants: { participant_code: string; full_name: string } | null;
  teams: { name: string; team_code: string } | null;
  recorder: { full_name: string | null } | null;
};

export default async function AttendancePage(props: PageProps<"/staff/attendance">) {
  const session = await requireStaff();
  const sp = (await props.searchParams) as SearchParams;
  const q = sanitizeSearch(param(sp, "q"));
  const supabase = await createClient();
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  const canCorrect = can(session, "correct_attendance");

  const [{ count: total }, { count: present }, { data: log }, search] = await Promise.all([
    supabase.from("participants").select("id", { count: "exact", head: true }),
    supabase.from("attendance").select("id", { count: "exact", head: true }).eq("status", "present").eq("session_key", "main"),
    supabase
      .from("attendance")
      .select("id, status, method, checked_in_at, corrected_at, correction_reason, participants(participant_code, full_name), teams(name, team_code), recorder:profiles!attendance_recorded_by_fkey(full_name)")
      .order("checked_in_at", { ascending: false })
      .limit(25)
      .returns<LogRow[]>(),
    q
      ? supabase
          .from("participant_overview")
          .select("*")
          .or([`full_name.ilike.%${q}%`, `participant_code.ilike.%${q}%`, `email.ilike.%${q}%`, `team_name.ilike.%${q}%`, `team_code.ilike.%${q}%`].join(","))
          .order("participant_code")
          .limit(25)
          .returns<ParticipantOverview[]>()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <PageHeader title="Attendance" description="Scan ID card QR codes or search manually. Every check-in records the official and time."
        actions={<LinkButton href="/api/reports/attendance" variant="secondary" prefetch={false}>Export CSV</LinkButton>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Checked in" value={present ?? 0} tone="green" />
        <Stat label="Registered participants" value={total ?? 0} />
        <Stat label="Attendance rate" value={total ? `${Math.round(((present ?? 0) / total) * 100)}%` : "—"} tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <QrScanner initialToken={param(sp, "token") || undefined} />
        <Card>
          <CardTitle description="Find a participant by name, Participant ID, email or team.">Manual check-in</CardTitle>
          <form className="flex gap-2" role="search">
            <label htmlFor="att-q" className="sr-only">Search participants</label>
            <input id="att-q" name="q" defaultValue={param(sp, "q")} className={inputClass} placeholder="Name, Participant ID, email or team" />
            <button className={buttonClass("primary")} type="submit">Search</button>
          </form>
          <div className="mt-4">
            {!q ? (
              <p className="text-sm text-slate-400">Enter a search term to find participants.</p>
            ) : !search.data?.length ? (
              <EmptyState title="No matching participants" />
            ) : (
              <ul className="divide-y divide-navy-800">
                {search.data.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">{p.full_name} <span className="font-mono text-xs text-slate-400">{p.participant_code}</span></p>
                      <p className="text-xs text-slate-400">{p.team_name} · {p.team_code}{p.team_status !== "approved" && ` · registration ${p.team_status}`}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AttendanceBadge state={p.attendance_state} />
                      {p.attendance_state !== "present" && p.team_status !== "rejected" && <ManualCheckInButton participantId={p.id} name={p.full_name} />}
                      {p.attendance_state === "present" && p.attendance_id && canCorrect && <UndoCheckIn attendanceId={p.attendance_id} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle description={canCorrect ? "Corrections require a reason and are kept in the audit trail." : undefined}>Recent check-ins</CardTitle>
        {!log?.length ? (
          <EmptyState title="No check-ins yet" />
        ) : (
          <Table caption="Recent check-ins">
            <thead><tr><Th>Time</Th><Th>Participant</Th><Th>Team</Th><Th>Method</Th><Th>Recorded by</Th><Th>Status</Th>{canCorrect && <Th>Action</Th>}</tr></thead>
            <tbody className="divide-y divide-navy-800">
              {log.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatTime(r.checked_in_at, tz)}</Td>
                  <Td>{r.participants?.full_name} <span className="font-mono text-xs text-slate-400">{r.participants?.participant_code}</span></Td>
                  <Td>{r.teams?.name}</Td>
                  <Td className="uppercase text-xs">{r.method}</Td>
                  <Td>{r.recorder?.full_name ?? "—"}</Td>
                  <Td>
                    <AttendanceBadge state={r.status === "present" ? "present" : "corrected"} />
                    {r.status === "corrected" && <p className="mt-1 text-xs text-slate-400">{formatDateTime(r.corrected_at, tz)}: {r.correction_reason}</p>}
                  </Td>
                  {canCorrect && <Td>{r.status === "present" && <UndoCheckIn attendanceId={r.id} />}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-xs text-slate-400">Team-wise attendance is shown in the <Link href="/staff/teams" className="underline">Teams</Link> table.</p>
      </Card>
    </>
  );
}
