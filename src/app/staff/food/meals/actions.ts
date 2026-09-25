"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { extractQrToken } from "@/lib/domain/ids";
import { fromLocalInput } from "@/lib/format";
import { getHackathon } from "@/lib/data/event";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { MealServeResult } from "@/lib/types";

const LIST = "/staff/food/meals";

const mealSchema = z.object({ name: z.string().trim().min(1, "Name the meal, e.g. Day 1 Lunch.").max(60) });

export async function saveMeal(formData: FormData) {
  const session = await requirePermission("manage_food");
  const id = str(formData, "id", 40);
  if (id && !UUID.test(id)) flash(LIST, { error: "Invalid meal." });
  const parsed = mealSchema.safeParse({ name: str(formData, "name", 80) });
  if (!parsed.success) flash(LIST, { error: parsed.error.issues[0].message });
  const tz = (await getHackathon())?.timezone ?? "Asia/Kolkata";
  const row = { name: parsed.data.name, serves_at: fromLocalInput(str(formData, "serves_at"), tz) };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("meals").update(row).eq("id", id)
    : await supabase.from("meals").insert({ ...row, hackathon_id: session.hackathonId });
  if (error?.code === "23505") flash(LIST, { error: "There is already a meal with this name." });
  if (error) flash(LIST, { error: dbErrorMessage(error) });
  revalidatePath(LIST);
  flash(LIST, { notice: id ? "Meal saved." : "Meal added. Open it when serving starts." });
}

export async function setMealOpen(id: string, open: boolean, back: string) {
  await requirePermission("manage_food");
  const path = back.startsWith(LIST) ? back : LIST;
  if (!UUID.test(id)) flash(path, { error: "Invalid meal." });
  const { error } = await (await createClient()).from("meals").update({ is_open: open }).eq("id", id);
  if (error) flash(path, { error: dbErrorMessage(error) });
  revalidatePath(LIST, "layout");
  flash(path, { notice: open ? "Serving started: scan ID cards now." : "Serving closed." });
}

export async function deleteMeal(id: string) {
  await requirePermission("manage_food");
  if (!UUID.test(id)) flash(LIST, { error: "Invalid meal." });
  const { error } = await (await createClient()).from("meals").delete().eq("id", id);
  if (error) flash(LIST, { error: dbErrorMessage(error) });
  revalidatePath(LIST);
  flash(LIST, { notice: "Meal deleted with its servings." });
}

/** Scanner / handheld input: a QR payload (verify URL or token). */
export async function serveByScan(mealId: string, scanned: string): Promise<MealServeResult> {
  await requirePermission("manage_food");
  if (!UUID.test(mealId)) return { state: "invalid", message: "Invalid meal." };
  const token = extractQrToken(String(scanned ?? "").slice(0, 500));
  if (!token) return { state: "invalid", message: "That is not a HackathonBase ID card QR code." };
  return serve(mealId, { p_token: token });
}

/** Counter search fallback (lost card, broken camera). */
export async function serveByPick(mealId: string, participantId: string): Promise<MealServeResult> {
  await requirePermission("manage_food");
  if (!UUID.test(mealId) || !UUID.test(participantId)) return { state: "invalid", message: "Invalid request." };
  return serve(mealId, { p_participant: participantId });
}

async function serve(mealId: string, args: { p_token?: string; p_participant?: string }): Promise<MealServeResult> {
  const { data, error } = await (await createClient()).rpc("serve_meal", { p_meal: mealId, ...args });
  if (error || !data) return { state: "invalid", message: "Could not record the serving. Check your connection and scan again." };
  revalidatePath(`${LIST}/${mealId}`);
  return data as MealServeResult;
}

export type PickResult = { id: string; full_name: string; participant_code: string; team_name: string };

/** Names and IDs only (no contact details), within this hackathon. */
export async function searchPeople(query: string): Promise<PickResult[]> {
  const session = await requirePermission("manage_food");
  const q = String(query ?? "").trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (q.length < 2) return [];
  const { data } = await createServiceClient()
    .from("participants")
    .select("id, full_name, participant_code, teams(name)")
    .eq("hackathon_id", session.hackathonId)
    .or(`full_name.ilike.%${q}%,participant_code.ilike.%${q}%`)
    .order("full_name").limit(8)
    .returns<{ id: string; full_name: string; participant_code: string; teams: { name: string } | null }[]>();
  return (data ?? []).map((p) => ({ id: p.id, full_name: p.full_name, participant_code: p.participant_code, team_name: p.teams?.name ?? "" }));
}

export async function undoServing(mealId: string, servingId: number) {
  await requirePermission("manage_food");
  const path = `${LIST}/${mealId}`;
  if (!UUID.test(mealId) || !Number.isInteger(servingId)) flash(LIST, { error: "Invalid request." });
  const { data, error } = await (await createClient()).rpc("undo_meal_serving", { p_serving: servingId });
  if (error || !data) flash(path, { error: "Could not undo that serving." });
  revalidatePath(path);
  flash(path, { notice: "Serving removed. That person can be served again." });
}
