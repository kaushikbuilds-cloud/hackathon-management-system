"use server";

import { revalidatePath } from "next/cache";
import { UUID, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireParticipant } from "@/lib/auth";
import { MENTOR_TOPICS } from "@/lib/mentors";
import { createClient } from "@/lib/supabase/server";

const PATH = "/portal/mentor";

/** Any team member asks for a mentor; the database checks the desk is open and there's one request at a time. */
export async function askMentor(formData: FormData) {
  const session = await requireParticipant();
  const topic = str(formData, "topic", 40);
  const details = str(formData, "details", 600);
  const location = str(formData, "location", 100);
  if (!(MENTOR_TOPICS as readonly string[]).includes(topic)) flash(PATH, { error: "Choose what you need help with." });
  if (details.length < 5 || details.length > 500) flash(PATH, { error: "Describe what you need in 5–500 characters." });
  if (location.length > 80) flash(PATH, { error: "Keep where you are sitting under 80 characters." });
  const { data, error } = await (await createClient()).rpc("request_mentor", { p_topic: topic, p_details: details, p_location: location || null });
  if (error) flash(PATH, { error: "Could not send your request. Please try again." });
  const result = data as { ok: boolean; message?: string; id?: string };
  if (!result.ok) flash(PATH, { error: result.message ?? "Could not send your request." });
  await audit(session, "mentor.requested", { type: "mentor_requests", id: result.id }, { topic });
  revalidatePath(PATH);
  flash(PATH, { notice: "Request sent. A mentor will come to you soon." });
}

export async function cancelMentorRequest(id: string) {
  const session = await requireParticipant();
  if (!UUID.test(id)) flash(PATH, { error: "Invalid request." });
  const { data, error } = await (await createClient()).rpc("cancel_mentor_request", { p_request: id });
  if (error) flash(PATH, { error: "Could not cancel. Please try again." });
  const result = data as { ok: boolean; message?: string };
  if (!result.ok) flash(PATH, { error: result.message ?? "Could not cancel." });
  await audit(session, "mentor.cancelled", { type: "mentor_requests", id });
  revalidatePath(PATH);
  flash(PATH, { notice: "Request cancelled." });
}
