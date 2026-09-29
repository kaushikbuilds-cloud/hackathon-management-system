"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UUID, bool, dbErrorMessage, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { BUCKETS, uploadObject, validateUpload } from "@/lib/storage";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const PATH = "/staff/problem-statements";

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/portal/problem-statement");
  revalidatePath("/", "layout");
}

const schema = z.object({
  title: z.string().trim().min(3, "Give the problem statement a title (at least 3 characters).").max(150),
  description: z.string().trim().max(5000),
  track: z.string().trim().max(60),
  max_teams: z.union([z.literal(""), z.coerce.number().int().min(1, "Team limit must be 1–1000").max(1000, "Team limit must be 1–1000")]),
  sort_order: z.coerce.number().int().min(0).max(10000),
});

export async function saveStatement(formData: FormData) {
  const session = await requirePermission("manage_event");
  const id = str(formData, "id", 40);
  if (id && !UUID.test(id)) flash(PATH, { error: "Invalid problem statement." });
  const parsed = schema.safeParse({
    title: str(formData, "title", 200), description: str(formData, "description", 5200), track: str(formData, "track", 80),
    max_teams: str(formData, "max_teams", 5), sort_order: str(formData, "sort_order", 6) || "0",
  });
  if (!parsed.success) flash(PATH, { error: parsed.error.issues[0].message });
  const d = parsed.data;
  const file = formData.get("attachment");
  const pdf = file instanceof File && file.size > 0 ? await validateUpload(file, ["application/pdf"], 10 * 1024 * 1024) : null;
  if (pdf && !pdf.ok) flash(PATH, { error: `Attachment: ${pdf.error}` });

  const row: Record<string, unknown> = {
    title: d.title, description: d.description, track: d.track || null, max_teams: d.max_teams === "" ? null : d.max_teams,
    sort_order: d.sort_order, is_published: bool(formData, "is_published"),
  };
  const supabase = await createClient();
  const { data: saved, error } = id
    ? await supabase.from("problem_statements").update(row).eq("id", id).select("id, code").single<{ id: string; code: string }>()
    : await supabase.from("problem_statements").insert({ ...row, hackathon_id: session.hackathonId }).select("id, code").single<{ id: string; code: string }>();
  if (error || !saved) flash(PATH, { error: dbErrorMessage(error ?? { message: "not saved" }) });

  const service = createServiceClient(session.userId);
  if (pdf?.ok) {
    const path = `${session.hackathonId}/problem-statements/${saved.id}-${Date.now()}.pdf`;
    await uploadObject(BUCKETS.projectFiles, path, pdf.bytes, pdf.contentType);
    await service.from("problem_statements").update({ attachment_path: path }).eq("id", saved.id);
  } else if (bool(formData, "remove_attachment")) {
    await service.from("problem_statements").update({ attachment_path: null }).eq("id", saved.id);
  }
  await audit(session, id ? "problem_statement.updated" : "problem_statement.created", { type: "problem_statements", id: saved.id }, { code: saved.code });
  refresh();
  flash(PATH, { notice: id ? `${saved.code} saved.` : `${saved.code} added.` });
}

export async function deleteStatement(id: string) {
  const session = await requirePermission("manage_event");
  if (!UUID.test(id)) flash(PATH, { error: "Invalid problem statement." });
  const { error } = await (await createClient()).from("problem_statements").delete().eq("id", id);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  await audit(session, "problem_statement.deleted", { type: "problem_statements", id });
  refresh();
  flash(PATH, { notice: "Problem statement deleted. Teams that had chosen it can choose again." });
}

export async function setSelectionOpen(open: boolean) {
  const session = await requirePermission("manage_event");
  const { error } = await createServiceClient(session.userId).from("hackathons").update({ ps_selection_open: open }).eq("id", session.hackathonId);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  await audit(session, open ? "problem_statements.selection_opened" : "problem_statements.selection_closed", { type: "hackathons", id: session.hackathonId });
  refresh();
  flash(PATH, { notice: open ? "Teams can now choose a problem statement." : "Selection is closed. Teams' choices are locked." });
}
