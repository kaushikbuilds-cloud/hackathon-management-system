import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportMessage, SupportRequest } from "@/lib/types";

/** Loads a request and its thread through RLS (returns null if not visible to the caller). */
export async function loadSupportThread(supabase: SupabaseClient, id: string) {
  const { data: request } = await supabase
    .from("support_requests")
    .select("*, teams(name, team_code)")
    .eq("id", id)
    .maybeSingle<SupportRequest & { teams: { name: string; team_code: string } | null }>();
  if (!request) return null;
  const [{ data: messages }, { data: history }] = await Promise.all([
    supabase.from("support_messages").select("*").eq("request_id", id).order("created_at").returns<SupportMessage[]>(),
    supabase.from("support_status_history").select("id, from_status, to_status, created_at").eq("request_id", id).order("created_at")
      .returns<{ id: string; from_status: string | null; to_status: string; created_at: string }[]>(),
  ]);
  const authorIds = [...new Set((messages ?? []).map((m) => m.author_id).filter((v): v is string => Boolean(v)))];
  // Participants cannot read other profiles via RLS; resolve author names/roles with a safe projection.
  return { request, messages: messages ?? [], history: history ?? [], authorIds };
}
