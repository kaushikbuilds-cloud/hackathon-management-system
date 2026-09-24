import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Counted = { label: string; value: number };

function tally<T>(rows: T[], key: (r: T) => string | null | undefined): Counted[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = key(r)?.trim() || "Unspecified";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Aggregates for the admin dashboard (RLS applies; intended for admins). */
export async function loadDashboardStats(supabase: SupabaseClient) {
  const [{ data: teams }, { data: people }, { data: support }] = await Promise.all([
    supabase.from("team_overview").select("status, pdf_status, college, attendance_state, member_count, present_count").returns<{ status: string; pdf_status: string; college: string | null; attendance_state: string; member_count: number; present_count: number }[]>(),
    supabase.from("participant_overview").select("department, college, attendance_state, role").returns<{ department: string | null; college: string | null; attendance_state: string; role: string }[]>(),
    supabase.from("support_requests").select("status").returns<{ status: string }[]>(),
  ]);
  const t = teams ?? [];
  const p = people ?? [];
  return {
    teams: t.length,
    participants: p.length,
    present: p.filter((x) => x.attendance_state === "present").length,
    registration: tally(t, (x) => x.status),
    pdf: tally(t, (x) => x.pdf_status),
    teamAttendance: tally(t, (x) => x.attendance_state),
    teamsByCollege: tally(t, (x) => x.college),
    participantsByDepartment: tally(p, (x) => x.department),
    support: tally(support ?? [], (x) => x.status),
    openSupport: (support ?? []).filter((x) => !["resolved", "closed"].includes(x.status)).length,
  };
}
