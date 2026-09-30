"use server";

import { revalidatePath } from "next/cache";
import { UUID, dbErrorMessage, flash } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const PATH = "/staff/mentors";
const NOTICE = { claim: "It's yours. The team has been told you're on the way.", release: "Handed back to the queue.", done: "Marked as done. Thanks for helping!" } as const;

/** A mentor claims, hands back or finishes a request; the database stops two mentors taking the same one. */
export async function mentorAction(id: string, action: keyof typeof NOTICE) {
  const session = await requirePermission("mentor_teams");
  if (!UUID.test(id) || !(action in NOTICE)) flash(PATH, { error: "Invalid request." });
  const { data, error } = await (await createClient()).rpc("mentor_request_action", { p_request: id, p_action: action });
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  const result = data as { ok: boolean; message?: string };
  if (!result.ok) flash(PATH, { error: result.message ?? "Could not update the request." });
  await audit(session, `mentor.${action}`, { type: "mentor_requests", id });
  revalidatePath(PATH);
  flash(PATH, { notice: NOTICE[action] });
}

export async function setMentorDeskOpen(open: boolean) {
  const session = await requirePermission("manage_event");
  const { error } = await createServiceClient(session.userId).from("hackathons").update({ mentor_desk_open: open }).eq("id", session.hackathonId);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  await audit(session, open ? "mentor_desk.opened" : "mentor_desk.closed", { type: "hackathons", id: session.hackathonId });
  revalidatePath(PATH);
  flash(PATH, { notice: open ? "The mentor desk is open. Teams can ask for help." : "The mentor desk is closed. Open requests stay in the queue." });
}
