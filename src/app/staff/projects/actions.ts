"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { fromLocalInput } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";

const PATH = "/staff/projects";

/** Open or close project submissions and set the deadline (in the event's time zone). */
export async function saveProjectSettings(formData: FormData) {
  const session = await requirePermission("manage_event", "manage_judging");
  const tz = (await getHackathon())?.timezone ?? "UTC";
  const raw = str(formData, "deadline", 30);
  const deadline = raw ? fromLocalInput(raw, tz) : null;
  if (raw && !deadline) flash(PATH, { error: "Enter a valid deadline." });
  const open = formData.get("open") === "on";
  const { error } = await createServiceClient(session.userId).from("hackathons").update({ projects_open: open, projects_deadline: deadline }).eq("id", session.hackathonId);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  await audit(session, "projects.settings", { type: "hackathons", id: session.hackathonId }, { open, deadline });
  revalidatePath(PATH);
  revalidatePath("/portal/project");
  flash(PATH, { notice: open ? "Project submissions are open." : "Project submissions are closed." });
}
