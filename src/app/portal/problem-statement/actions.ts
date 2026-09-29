"use server";

import { revalidatePath } from "next/cache";
import { UUID, flash } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireParticipant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PATH = "/portal/problem-statement";

/** The team chooses (or clears, with null) its problem statement; the database checks limits and timing. */
export async function chooseStatement(statementId: string | null) {
  const session = await requireParticipant();
  if (statementId !== null && !UUID.test(statementId)) flash(PATH, { error: "Invalid problem statement." });
  const { data, error } = await (await createClient()).rpc("choose_problem_statement", { p_statement: statementId });
  if (error) flash(PATH, { error: error.code === "42501" ? "Only your Team Leader can choose the problem statement." : "Could not save your choice. Please try again." });
  const result = data as { ok: boolean; message?: string };
  if (!result.ok) flash(PATH, { error: result.message ?? "Could not save your choice." });
  await audit(session, "problem_statement.chosen", { type: "problem_statements", id: statementId });
  revalidatePath(PATH);
  revalidatePath("/portal");
  flash(PATH, { notice: statementId ? "Problem statement chosen. You can change it while selection is open." : "Choice cleared." });
}
