import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProblemStatement } from "@/lib/types";

/** Statements visible to the caller (published ones, plus drafts for staff who run the event). */
export async function loadStatements(hackathonId: string): Promise<ProblemStatement[]> {
  const { data } = await (await createClient()).from("problem_statements").select("*")
    .eq("hackathon_id", hackathonId).order("sort_order").order("code").returns<ProblemStatement[]>();
  return data ?? [];
}

/** Teams per published statement (a count only; rejected teams are not counted). */
export async function statementTaken(hackathonId: string): Promise<Map<string, number>> {
  const { data } = await (await createClient()).rpc("problem_statement_taken", { p_hackathon: hackathonId });
  return new Map(((data ?? []) as { statement_id: string; teams: number }[]).map((r) => [r.statement_id, r.teams]));
}

export const statementLabel = (s: Pick<ProblemStatement, "code" | "title">) => `${s.code} · ${s.title}`;
