"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const LIST = "/staff/judging";
const RESULTS = "/staff/judging/results";

/** A judge saves (or updates) their scores for one team. */
export async function submitScore(teamId: string, formData: FormData) {
  await requirePermission("judge_teams");
  if (!UUID.test(teamId)) flash(LIST, { error: "Invalid team." });
  const scores: Record<string, number | string> = {};
  for (const [k, v] of formData.entries()) {
    const id = k.startsWith("c_") ? k.slice(2) : "";
    if (UUID.test(id)) scores[id] = String(v).trim() === "" ? "" : Number(v);
  }
  const { data, error } = await (await createClient()).rpc("submit_judge_score", { p_team: teamId, p_scores: scores, p_comment: str(formData, "comment", 1000) });
  const back = `${LIST}/${teamId}`;
  if (error) flash(back, { error: dbErrorMessage(error) });
  const result = data as { ok: boolean; message?: string; total?: number };
  if (!result.ok) flash(back, { error: result.message ?? "Could not save the score." });
  revalidatePath(LIST);
  flash(LIST, { notice: `Score saved (${result.total} points).` });
}

const criterionSchema = z.object({
  name: z.string().trim().min(1, "Give the criterion a name").max(60),
  description: z.string().trim().max(200),
  max_points: z.coerce.number().int("Maximum must be a whole number").min(1, "Maximum must be 1–100").max(100, "Maximum must be 1–100"),
  sort_order: z.coerce.number().int().min(0).max(1000),
});

export async function saveCriterion(formData: FormData) {
  const session = await requirePermission("manage_judging");
  const id = str(formData, "id", 40);
  if (id && !UUID.test(id)) flash(RESULTS, { error: "Invalid criterion." });
  const parsed = criterionSchema.safeParse({
    name: str(formData, "name", 100), description: str(formData, "description", 250),
    max_points: str(formData, "max_points", 4) || "10", sort_order: str(formData, "sort_order", 5) || "0",
  });
  if (!parsed.success) flash(RESULTS, { error: parsed.error.issues[0].message });
  const row = { ...parsed.data, description: parsed.data.description || null };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("judging_criteria").update(row).eq("id", id)
    : await supabase.from("judging_criteria").insert({ ...row, hackathon_id: session.hackathonId });
  if (error) flash(RESULTS, { error: dbErrorMessage(error) });
  revalidatePath(RESULTS);
  flash(RESULTS, { notice: id ? "Criterion saved." : "Criterion added." });
}

export async function deleteCriterion(id: string) {
  await requirePermission("manage_judging");
  if (!UUID.test(id)) flash(RESULTS, { error: "Invalid criterion." });
  const { error } = await (await createClient()).from("judging_criteria").delete().eq("id", id);
  if (error) flash(RESULTS, { error: dbErrorMessage(error) });
  revalidatePath(RESULTS);
  flash(RESULTS, { notice: "Criterion removed. Scores already given for it no longer count." });
}

export async function setJudgingOpen(open: boolean) {
  const session = await requirePermission("manage_judging");
  const { error } = await createServiceClient(session.userId).from("hackathons").update({ judging_open: open }).eq("id", session.hackathonId);
  if (error) flash(RESULTS, { error: dbErrorMessage(error) });
  await audit(session, open ? "judging.opened" : "judging.closed", { type: "hackathons", id: session.hackathonId });
  revalidatePath(LIST);
  revalidatePath(RESULTS);
  flash(RESULTS, { notice: open ? "Judging is open. Judges can score teams now." : "Judging is closed. Scores are locked." });
}

/** Give (or clear) a team's award from the leaderboard; it becomes their certificate of achievement. */
export async function setAward(teamId: string, formData: FormData) {
  const session = await requirePermission("manage_judging");
  if (!UUID.test(teamId)) flash(RESULTS, { error: "Invalid team." });
  const award = str(formData, "award", 60).replace(/\s+/g, " ") || null;
  const { error } = await createServiceClient(session.userId).from("teams").update({ award }).eq("id", teamId).eq("hackathon_id", session.hackathonId);
  if (error) flash(RESULTS, { error: dbErrorMessage(error) });
  revalidatePath(RESULTS);
  revalidatePath("/staff/certificates");
  flash(RESULTS, { notice: award ? `Award saved: ${award}.` : "Award removed." });
}

/** Show (or hide) the winners on the public results page; the first time, every approved team is notified. */
export async function setResultsPublished(publish: boolean) {
  const session = await requirePermission("manage_judging");
  const service = createServiceClient(session.userId);
  const { data: h } = await service.from("hackathons").select("slug, results_published_at").eq("id", session.hackathonId).single<{ slug: string; results_published_at: string | null }>();
  if (publish) {
    const { count } = await service.from("teams").select("id", { count: "exact", head: true }).eq("hackathon_id", session.hackathonId).eq("status", "approved").not("award", "is", null);
    if (!count) flash(RESULTS, { error: "Give at least one team an award before publishing the results." });
  }
  const first = publish && !h?.results_published_at;
  const { error } = await service.from("hackathons")
    .update({ results_published: publish, ...(first ? { results_published_at: new Date().toISOString() } : {}) })
    .eq("id", session.hackathonId);
  if (error) flash(RESULTS, { error: dbErrorMessage(error) });
  if (first && h) {
    const { data: teams } = await service.from("teams").select("id").eq("hackathon_id", session.hackathonId).eq("status", "approved").returns<{ id: string }[]>();
    if (teams?.length) {
      await service.from("notifications").insert(teams.map((t) => ({
        team_id: t.id, title: "Results are out", body: "The winners have been announced. Thank you for taking part!", link: `/h/${h.slug}/results`,
      })));
    }
  }
  await audit(session, publish ? "results.published" : "results.hidden", { type: "hackathons", id: session.hackathonId });
  revalidatePath(RESULTS);
  if (h) revalidatePath(`/h/${h.slug}`, "layout");
  flash(RESULTS, { notice: publish ? `Results are public${first ? " and teams were notified" : ""}.` : "Results are hidden from the public page." });
}
