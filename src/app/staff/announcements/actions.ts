"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UUID, bool, dbErrorMessage, flash, str } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { fromLocalInput } from "@/lib/format";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const PATH = "/staff/announcements";

const annSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(150),
  body: z.string().trim().min(1, "Message is required").max(10000),
  audience: z.enum(["all", "participants", "staff"]),
  status: z.enum(["draft", "published", "archived"]),
});

/** In-app notification to every team for important published announcements. */
async function notifyTeams(actorId: string, hackathonId: string, title: string) {
  const service = createServiceClient(actorId);
  const { data: teams } = await service.from("teams").select("id").eq("hackathon_id", hackathonId).neq("status", "rejected");
  if (teams?.length) {
    await service.from("notifications").insert(teams.map((t) => ({ team_id: t.id, title: "Important announcement", body: title, link: "/portal/schedule" })));
  }
}

export async function saveAnnouncement(formData: FormData) {
  const session = await requirePermission("publish_announcements");
  const id = str(formData, "id", 40);
  if (id && !UUID.test(id)) flash(PATH, { error: "Invalid announcement." });
  const parsed = annSchema.safeParse({ title: str(formData, "title", 200), body: str(formData, "body", 10000), audience: str(formData, "audience") || "all", status: str(formData, "status") || "draft" });
  if (!parsed.success) flash(PATH, { error: parsed.error.issues[0].message });
  const important = bool(formData, "is_important");
  const supabase = await createClient();
  const hackathon = await getHackathon();
  const row = { ...parsed.data, is_important: important, hackathon_id: hackathon?.id, ...(id ? {} : { created_by: session.userId }) };
  const { data: before } = id ? await supabase.from("announcements").select("status").eq("id", id).maybeSingle<{ status: string }>() : { data: null };
  const { error } = id ? await supabase.from("announcements").update(row).eq("id", id) : await supabase.from("announcements").insert(row);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  if (important && parsed.data.status === "published" && before?.status !== "published" && parsed.data.audience !== "staff") {
    await notifyTeams(session.userId, session.hackathonId, parsed.data.title);
  }
  revalidatePath(PATH);
  revalidatePath("/portal", "layout");
  flash(PATH, { notice: parsed.data.status === "published" ? "Announcement published." : "Announcement saved." });
}

export async function deleteAnnouncement(id: string) {
  await requirePermission("publish_announcements");
  if (!UUID.test(id)) flash(PATH, { error: "Invalid announcement." });
  const { error } = await (await createClient()).from("announcements").delete().eq("id", id);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  revalidatePath(PATH);
  flash(PATH, { notice: "Announcement deleted." });
}

const scheduleSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(150),
  description: z.string().trim().max(2000),
  venue: z.string().trim().max(200),
  visibility: z.enum(["public", "participants", "staff"]),
});

export async function saveScheduleItem(formData: FormData) {
  await requirePermission("publish_announcements");
  const id = str(formData, "id", 40);
  if (id && !UUID.test(id)) flash(PATH, { error: "Invalid schedule item." });
  const parsed = scheduleSchema.safeParse({ title: str(formData, "title", 200), description: str(formData, "description", 2000), venue: str(formData, "venue", 200), visibility: str(formData, "visibility") || "public" });
  if (!parsed.success) flash(PATH, { error: parsed.error.issues[0].message });
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  const startsAt = fromLocalInput(str(formData, "starts_at"), tz);
  const endsAt = fromLocalInput(str(formData, "ends_at"), tz);
  if (!startsAt) flash(PATH, { error: "Start time is required." });
  if (endsAt && endsAt < startsAt) flash(PATH, { error: "End time must be after the start time." });
  const row = { ...parsed.data, description: parsed.data.description || null, venue: parsed.data.venue || null, starts_at: startsAt, ends_at: endsAt, hackathon_id: hackathon?.id };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("event_schedule").update(row).eq("id", id) : await supabase.from("event_schedule").insert(row);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  revalidatePath(PATH);
  flash(PATH, { notice: "Schedule saved." });
}

export async function deleteScheduleItem(id: string) {
  await requirePermission("publish_announcements");
  if (!UUID.test(id)) flash(PATH, { error: "Invalid schedule item." });
  const { error } = await (await createClient()).from("event_schedule").delete().eq("id", id);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  revalidatePath(PATH);
  flash(PATH, { notice: "Schedule item deleted." });
}
