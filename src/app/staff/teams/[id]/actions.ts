"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setAccountStatus } from "@/lib/accounts";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { createInvitation } from "@/lib/invitations";
import { cleanTeamName } from "@/lib/domain/normalize";
import { BUCKETS, uploadObject, validateUpload } from "@/lib/storage";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Participant } from "@/lib/types";

const teamPath = (id: string) => `/staff/teams/${id}`;

function assertId(id: string) {
  if (!UUID.test(id)) throw new Error("Invalid id");
}

const teamSchema = z.object({
  name: z.string().transform(cleanTeamName).pipe(z.string().min(2, "Team name must be at least 2 characters").max(80)),
  college: z.string().trim().max(150),
});

export async function updateTeam(teamId: string, formData: FormData) {
  assertId(teamId);
  await requirePermission("edit_registrations");
  const parsed = teamSchema.safeParse({ name: str(formData, "name"), college: str(formData, "college") });
  if (!parsed.success) flash(teamPath(teamId), { error: parsed.error.issues[0].message });
  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ name: parsed.data.name, college: parsed.data.college || null }).eq("id", teamId);
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  revalidatePath("/staff/teams");
  flash(teamPath(teamId), { notice: "Team details updated." });
}

export async function setTeamStatus(teamId: string, formData: FormData) {
  assertId(teamId);
  await requirePermission("manage_registrations");
  const status = z.enum(["pending", "approved", "rejected", "flagged"]).safeParse(formData.get("status"));
  if (!status.success) flash(teamPath(teamId), { error: "Invalid status." });
  const reason = str(formData, "reason", 500);
  if ((status.data === "rejected" || status.data === "flagged") && reason.length < 3) {
    flash(teamPath(teamId), { error: "Please give a reason when rejecting or flagging a registration." });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ status: status.data, status_reason: reason || null }).eq("id", teamId);
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  revalidatePath("/staff/teams");
  flash(teamPath(teamId), { notice: `Registration marked as ${status.data}.` });
}

const memberSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Invalid phone number")]),
  college: z.string().trim().max(150),
  department: z.string().trim().max(100),
  academic_year: z.string().trim().max(30),
});

function memberValues(formData: FormData) {
  return memberSchema.safeParse({
    full_name: str(formData, "full_name"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    college: str(formData, "college"),
    department: str(formData, "department"),
    academic_year: str(formData, "academic_year"),
  });
}

const nullable = (v: string) => (v ? v : null);

export async function updateParticipant(teamId: string, participantId: string, formData: FormData) {
  assertId(teamId);
  assertId(participantId);
  const session = await requirePermission("edit_registrations");
  const parsed = memberValues(formData);
  if (!parsed.success) flash(teamPath(teamId), { error: parsed.error.issues[0].message });
  const d = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("participants").select("email, user_id").eq("id", participantId).single<Pick<Participant, "email" | "user_id">>();
  const { error } = await supabase
    .from("participants")
    .update({ full_name: d.full_name, email: d.email, phone: nullable(d.phone), college: nullable(d.college), department: nullable(d.department), academic_year: nullable(d.academic_year) })
    .eq("id", participantId)
    .eq("team_id", teamId);
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  if (before?.user_id && before.email !== d.email) {
    // Keep the sign-in email in sync with the corrected registration email
    // (permission to edit registrations was checked above).
    const { error: authError } = await createServiceClient(session.userId).auth.admin.updateUserById(before.user_id, { email: d.email, email_confirm: true });
    if (authError) flash(teamPath(teamId), { error: `Participant saved, but the login email could not be updated: ${authError.message}` });
    await createServiceClient(session.userId).from("profiles").update({ email: d.email }).eq("id", before.user_id);
  }
  revalidatePath(teamPath(teamId));
  flash(teamPath(teamId), { notice: "Participant updated." });
}

export async function addParticipant(teamId: string, formData: FormData) {
  assertId(teamId);
  await requirePermission("edit_registrations");
  const parsed = memberValues(formData);
  if (!parsed.success) flash(teamPath(teamId), { error: parsed.error.issues[0].message });
  const supabase = await createClient();
  const [{ count }, { data: team }] = await Promise.all([
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("team_id", teamId),
    supabase.from("teams").select("college, form_id, registration_forms(max_team_size)").eq("id", teamId).single<{ college: string | null; registration_forms: { max_team_size: number } | null }>(),
  ]);
  const max = team?.registration_forms?.max_team_size ?? 20;
  if ((count ?? 0) >= max) flash(teamPath(teamId), { error: `Teams can have at most ${max} members.` });
  const d = parsed.data;
  const { error } = await supabase.from("participants").insert({
    team_id: teamId, full_name: d.full_name, email: d.email, phone: nullable(d.phone),
    college: nullable(d.college) ?? team?.college ?? null, department: nullable(d.department), academic_year: nullable(d.academic_year), role: "member",
  });
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  revalidatePath("/staff/teams");
  flash(teamPath(teamId), { notice: "Member added. The team's ID card PDF is now outdated." });
}

export async function removeParticipant(teamId: string, participantId: string) {
  assertId(teamId);
  assertId(participantId);
  const session = await requirePermission("manage_registrations");
  const supabase = await createClient();
  const { data: p } = await supabase.from("participants").select("*").eq("id", participantId).eq("team_id", teamId).single<Participant>();
  if (!p) flash(teamPath(teamId), { error: "Participant not found." });
  if (p.role === "leader") flash(teamPath(teamId), { error: "Assign another team leader before removing this member." });
  if (p.user_id) await setAccountStatus(session, p.user_id, "deactivated");
  const { error } = await supabase.from("participants").delete().eq("id", participantId);
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  revalidatePath("/staff/teams");
  flash(teamPath(teamId), { notice: `${p.full_name} was removed from the team.` });
}

export async function makeLeader(teamId: string, participantId: string) {
  assertId(teamId);
  assertId(participantId);
  await requirePermission("edit_registrations");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_team_leader", { p_participant_id: participantId });
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  revalidatePath("/staff/teams");
  flash(teamPath(teamId), { notice: "Team leader updated." });
}

export async function setQrRevoked(teamId: string, participantId: string, revoke: boolean) {
  assertId(teamId);
  assertId(participantId);
  await requirePermission("edit_registrations");
  const supabase = await createClient();
  const { error } = await supabase.from("participants").update({ qr_revoked_at: revoke ? new Date().toISOString() : null }).eq("id", participantId);
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  flash(teamPath(teamId), { notice: revoke ? "QR code revoked. Scans will show it as revoked." : "QR code restored." });
}

export async function rotateQr(teamId: string, participantId: string) {
  assertId(teamId);
  assertId(participantId);
  await requirePermission("edit_registrations");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rotate_qr_token", { p_participant_id: participantId });
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  flash(teamPath(teamId), { notice: "A new QR code was issued. Regenerate the team PDF and reprint this card." });
}

export async function uploadPhoto(teamId: string, participantId: string, formData: FormData) {
  assertId(teamId);
  assertId(participantId);
  const session = await requirePermission("edit_registrations");
  const file = formData.get("photo");
  if (!(file instanceof File)) flash(teamPath(teamId), { error: "Choose an image to upload." });
  const check = await validateUpload(file, ["image/png", "image/jpeg"], 2 * 1024 * 1024);
  if (!check.ok) flash(teamPath(teamId), { error: check.error });
  const path = `${participantId}/${Date.now()}.${check.extension}`;
  await uploadObject(BUCKETS.photos, path, check.bytes, check.contentType);
  const { error } = await createServiceClient(session.userId).from("participants").update({ photo_path: path }).eq("id", participantId).eq("team_id", teamId).eq("hackathon_id", session.hackathonId);
  if (error) flash(teamPath(teamId), { error: dbErrorMessage(error) });
  flash(teamPath(teamId), { notice: "Photo uploaded." });
}

export type LinkState = { error?: string; link?: string; email?: string; name?: string; expiresAt?: string; purpose?: string };

/**
 * Creates a single-use activation link for a participant (or a password reset
 * link if they already have an account). Managing participant access is part
 * of registration management.
 */
export async function createParticipantLink(participantId: string, _prev: LinkState, _formData: FormData): Promise<LinkState> {
  assertId(participantId);
  const session = await requirePermission("manage_registrations");
  const service = createServiceClient(session.userId);
  const { data: p } = await service.from("participants").select("id, email, full_name, user_id").eq("id", participantId).eq("hackathon_id", session.hackathonId).maybeSingle<Pick<Participant, "id" | "email" | "full_name" | "user_id">>();
  if (!p) return { error: "Participant not found." };
  const invitation = await createInvitation(session, p.user_id
    ? { role: "participant", purpose: "reset", email: p.email, profileId: p.user_id, participantId: p.id, fullName: p.full_name }
    : { role: "participant", email: p.email, participantId: p.id, fullName: p.full_name });
  revalidatePath("/staff/teams");
  return { link: invitation.url, email: p.email, name: p.full_name, expiresAt: invitation.expiresAt, purpose: invitation.purpose === "reset" ? "password reset" : "account activation" };
}

export async function setParticipantAccountStatus(teamId: string, userId: string, status: "active" | "suspended" | "deactivated") {
  assertId(teamId);
  assertId(userId);
  const session = await requirePermission("manage_registrations");
  const { data: target } = await createServiceClient().from("profiles").select("role").eq("id", userId).eq("hackathon_id", session.hackathonId).maybeSingle<{ role: string }>();
  if (target?.role !== "participant") flash(teamPath(teamId), { error: "Account not found." });
  const res = await setAccountStatus(session, userId, status);
  flash(teamPath(teamId), res.ok ? { notice: res.message } : { error: res.error });
}
