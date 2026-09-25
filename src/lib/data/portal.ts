import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceState } from "@/lib/domain/labels";
import type { Announcement, ParticipantOverview, ScheduleItem, Team } from "@/lib/types";

export type RosterEntry = { id: string; participant_code: string; full_name: string; role: "leader" | "member"; attendance_state: AttendanceState };

/**
 * The signed-in participant's team. Everyone gets the contact-free roster;
 * only the Team Leader also gets full member rows (RLS enforces the same).
 */
export async function loadMyTeam(participantId: string) {
  const supabase = await createClient();
  const { data: teamId } = await supabase.rpc("my_team_id");
  if (!teamId) return null;
  const [{ data: team }, { data: roster }, { data: rows }] = await Promise.all([
    supabase.from("teams").select("*").eq("id", teamId).single<Team>(),
    supabase.rpc("my_team_roster"),
    supabase.from("participant_overview").select("*").eq("team_id", teamId).order("role").order("participant_code").returns<ParticipantOverview[]>(),
  ]);
  if (!team) return null;
  const me = (rows ?? []).find((r) => r.id === participantId) ?? null;
  const isLeader = me?.role === "leader";
  return { team, roster: (roster ?? []) as RosterEntry[], me, isLeader, members: isLeader ? rows ?? [] : [] };
}

export async function loadAnnouncementsAndSchedule(limit = 50) {
  const supabase = await createClient();
  const [{ data: announcements }, { data: schedule }] = await Promise.all([
    supabase.from("announcements").select("*").eq("status", "published").order("is_important", { ascending: false }).order("published_at", { ascending: false }).limit(limit).returns<Announcement[]>(),
    supabase.from("event_schedule").select("*").order("starts_at").returns<ScheduleItem[]>(),
  ]);
  return { announcements: announcements ?? [], schedule: schedule ?? [] };
}
