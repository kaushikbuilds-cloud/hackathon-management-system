import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Announcement, ParticipantOverview, ScheduleItem, Team } from "@/lib/types";

/** Everything is read through RLS, which restricts participants to their own team. */
export async function loadMyTeam() {
  const supabase = await createClient();
  const { data: teamId } = await supabase.rpc("my_team_id");
  if (!teamId) return null;
  const [{ data: team }, { data: members }] = await Promise.all([
    supabase.from("teams").select("*").eq("id", teamId).single<Team>(),
    supabase.from("participant_overview").select("*").eq("team_id", teamId).order("role").order("participant_code").returns<ParticipantOverview[]>(),
  ]);
  return team ? { team, members: members ?? [] } : null;
}

export async function loadAnnouncementsAndSchedule(limit = 50) {
  const supabase = await createClient();
  const [{ data: announcements }, { data: schedule }] = await Promise.all([
    supabase.from("announcements").select("*").eq("status", "published").order("is_important", { ascending: false }).order("published_at", { ascending: false }).limit(limit).returns<Announcement[]>(),
    supabase.from("event_schedule").select("*").order("starts_at").returns<ScheduleItem[]>(),
  ]);
  return { announcements: announcements ?? [], schedule: schedule ?? [] };
}
