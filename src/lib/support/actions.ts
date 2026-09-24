"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { can, isStaff, requireParticipant, requireSession, requireStaff } from "@/lib/auth";
import { canTransition, SUPPORT_CATEGORIES, SUPPORT_STATUSES, type SupportStatus } from "@/lib/domain/support";
import { rateLimit } from "@/lib/rate-limit";
import { BUCKETS, uploadObject, validateUpload } from "@/lib/storage";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupportRequest } from "@/lib/types";

const requestSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(150),
  description: z.string().trim().min(5, "Please describe the issue").max(5000),
  contact_email: z.union([z.literal(""), z.string().trim().email("Invalid email").max(254)]),
  contact_phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Invalid phone number")]),
});

export type SupportFormState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

/** Team member creates a support request for their own team (team_id is forced server- and DB-side). */
export async function createSupportRequest(_prev: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const session = await requireParticipant();
  const values = {
    category: str(formData, "category", 40), subject: str(formData, "subject", 200), description: str(formData, "description", 6000),
    contact_email: str(formData, "contact_email", 254), contact_phone: str(formData, "contact_phone", 30),
  };
  const parsed = requestSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }
  if (!(await rateLimit("supportCreate", session.userId))) return { error: "Too many requests created recently. Please wait a bit.", values };

  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.size > 0;
  let upload: Awaited<ReturnType<typeof validateUpload>> | null = null;
  if (hasFile) {
    upload = await validateUpload(file, ["image/png", "image/jpeg", "application/pdf", "text/plain"], 5 * 1024 * 1024);
    if (!upload.ok) return { error: upload.error, fieldErrors: { attachment: upload.error }, values };
  }

  const supabase = await createClient();
  const { data: teamId } = await supabase.rpc("my_team_id");
  const d = parsed.data;
  const { data: created, error } = await supabase
    .from("support_requests")
    .insert({ team_id: teamId, category: d.category, subject: d.subject, description: d.description, contact_email: d.contact_email || session.email, contact_phone: d.contact_phone || null })
    .select("id, team_id")
    .single<{ id: string; team_id: string }>();
  if (error || !created) return { error: dbErrorMessage(error, "Could not create the request."), values };

  if (upload?.ok) {
    const path = `${created.team_id}/${created.id}/attachment.${upload.extension}`;
    try {
      await uploadObject(BUCKETS.attachments, path, upload.bytes, upload.contentType);
      await createServiceClient(session.userId).from("support_requests").update({ attachment_path: path }).eq("id", created.id);
    } catch {
      flash(`/portal/support/${created.id}`, { error: "Request created, but the attachment could not be uploaded." });
    }
  }
  revalidatePath("/portal/support");
  flash(`/portal/support/${created.id}`, { notice: "Support request submitted. We'll get back to you here." });
}

/** Reply on a request thread. Staff may mark a reply as an internal note. */
export async function replyToRequest(requestId: string, formData: FormData) {
  if (!UUID.test(requestId)) throw new Error("Invalid id");
  const session = await requireSession();
  const staff = isStaff(session);
  const back = staff ? `/staff/support/${requestId}` : `/portal/support/${requestId}`;
  const body = str(formData, "body", 5000);
  if (body.length < 1) flash(back, { error: "Write a message first." });
  const supabase = await createClient();
  const { error } = await supabase.from("support_messages").insert({ request_id: requestId, body, is_internal: staff && formData.get("internal") === "on" });
  if (error) flash(back, { error: dbErrorMessage(error, "Could not send the reply.") });
  revalidatePath(back);
  flash(back, { notice: "Reply sent." });
}

export async function updateRequestStatus(requestId: string, formData: FormData) {
  if (!UUID.test(requestId)) throw new Error("Invalid id");
  await requireStaff();
  const back = `/staff/support/${requestId}`;
  const to = formData.get("status");
  if (!SUPPORT_STATUSES.includes(to as SupportStatus)) flash(back, { error: "Invalid status." });
  const supabase = await createClient();
  const { data: current } = await supabase.from("support_requests").select("status").eq("id", requestId).maybeSingle<Pick<SupportRequest, "status">>();
  if (!current) flash(back, { error: "Request not found or not assigned to you." });
  if (!canTransition(current.status, to as SupportStatus)) flash(back, { error: `Cannot move from ${current.status} to ${to}.` });
  const { error } = await supabase.from("support_requests").update({ status: to }).eq("id", requestId);
  if (error) flash(back, { error: dbErrorMessage(error) });
  revalidatePath("/staff/support");
  flash(back, { notice: "Status updated. The team has been notified." });
}

export async function assignRequest(requestId: string, formData: FormData) {
  if (!UUID.test(requestId)) throw new Error("Invalid id");
  const session = await requireStaff();
  const back = `/staff/support/${requestId}`;
  if (!can(session, "manage_all_support")) flash(back, { error: "Only administrators can assign requests." });
  const assignee = str(formData, "assigned_to", 40);
  if (assignee && !UUID.test(assignee)) flash(back, { error: "Invalid assignee." });
  const supabase = await createClient();
  const { error } = await supabase.from("support_requests").update({ assigned_to: assignee || null }).eq("id", requestId);
  if (error) flash(back, { error: dbErrorMessage(error) });
  revalidatePath("/staff/support");
  flash(back, { notice: assignee ? "Request assigned." : "Assignment cleared." });
}
