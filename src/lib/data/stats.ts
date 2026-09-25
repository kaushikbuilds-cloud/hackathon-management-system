import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Counted = { label: string; value: number };

type RawStats = {
  teams: number; participants: number; present: number; pending_approvals: number; staff: number;
  pending_invitations: number; open_support: number;
  registration: Record<string, number>; pdf: Record<string, number>; support: Record<string, number>;
  teams_by_college: Record<string, number>; participants_by_department: Record<string, number>;
  team_attendance: Record<string, number>; recent_activity: { action: string; at: string }[];
};

const toCounted = (m: Record<string, number>): Counted[] =>
  Object.entries(m ?? {}).map(([label, value]) => ({ label, value: Number(value) })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

/** Aggregates only (no personal data) via the `dashboard_stats` RPC; requires view_reports. */
export async function loadDashboardStats(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("dashboard_stats");
  if (error || !data) throw new Error(error?.message ?? "Statistics unavailable");
  const s = data as RawStats;
  return {
    teams: s.teams, participants: s.participants, present: s.present, pendingApprovals: s.pending_approvals,
    staff: s.staff, pendingInvitations: s.pending_invitations, openSupport: s.open_support,
    registration: toCounted(s.registration), pdf: toCounted(s.pdf), support: toCounted(s.support),
    teamsByCollege: toCounted(s.teams_by_college), participantsByDepartment: toCounted(s.participants_by_department),
    teamAttendance: toCounted(s.team_attendance), recentActivity: s.recent_activity ?? [],
  };
}
