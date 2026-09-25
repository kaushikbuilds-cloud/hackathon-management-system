import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HackathonSummary = {
  id: string; name: string; slug: string; status: "setup" | "active" | "completed" | "archived";
  organizer_name: string | null; starts_at: string | null; ends_at: string | null; created_at: string;
  teams: number; participants: number; staff: number; present: number; open_support: number; last_activity: string | null;
};

/** One row per hackathon with usage counts (Super Admin only; enforced by the database). */
export async function loadPlatformOverview(supabase: SupabaseClient): Promise<HackathonSummary[]> {
  const { data, error } = await supabase.rpc("platform_overview");
  if (error) throw new Error(error.message);
  return ((data ?? []) as HackathonSummary[]).map((r) => ({
    ...r, teams: Number(r.teams), participants: Number(r.participants), staff: Number(r.staff), present: Number(r.present), open_support: Number(r.open_support),
  }));
}

export const HACKATHON_STATUS_LABEL = { setup: "Setting up", active: "Active", completed: "Completed", archived: "Archived" } as const;
export const HACKATHON_STATUS_TONE = { setup: "amber", active: "green", completed: "blue", archived: "neutral" } as const;
