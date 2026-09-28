import "server-only";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { JudgingCriterion } from "@/lib/types";

export type JudgingTeam = { id: string; team_code: string; name: string; track: string | null; college: string | null; form_id: string | null; custom_answers: Record<string, string> };

export async function loadCriteria(): Promise<JudgingCriterion[]> {
  const { data } = await (await createClient()).from("judging_criteria").select("*").order("sort_order").order("created_at").returns<JudgingCriterion[]>();
  return data ?? [];
}

export const maxTotal = (criteria: JudgingCriterion[]) => criteria.reduce((n, c) => n + c.max_points, 0);

/**
 * Approved teams a judge can score. Judges need no access to participant
 * data, so this reads only team names and answers, scoped to the hackathon.
 */
export async function judgingTeams(hackathonId: string, teamId?: string): Promise<JudgingTeam[]> {
  let q = createServiceClient().from("teams").select("id, team_code, name, track, college, form_id, custom_answers")
    .eq("hackathon_id", hackathonId).eq("status", "approved").order("team_code");
  if (teamId) q = q.eq("id", teamId);
  const { data } = await q.returns<JudgingTeam[]>();
  return data ?? [];
}
