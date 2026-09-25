"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setAccountStatus } from "@/lib/accounts";
import { UUID, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { can, isSuperAdmin, requireHackathon, requireStaff, type Session } from "@/lib/auth";
import { createInvitation, revokeInvitation } from "@/lib/invitations";
import { sanitizeGrants } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import type { Invitation, Profile } from "@/lib/types";

type StaffRole = "admin" | "official";

const pathFor = (role: StaffRole) => (role === "admin" ? "/staff/users/admins" : "/staff/users/officials");

/** Admins are managed only by the Super Admin; Officials also by Admins holding manage_officials. */
function mayManage(session: Session, role: StaffRole): boolean {
  return role === "admin" ? isSuperAdmin(session) : isSuperAdmin(session) || can(session, "manage_officials");
}

async function requireManager(role: StaffRole) {
  const session = await requireStaff();
  if (!mayManage(session, role)) flash("/staff/forbidden", { error: "You cannot manage these accounts." });
  // New staff always join the hackathon being managed.
  return requireHackathon(session);
}

/** Loads a staff account the actor may manage (never the actor themself, never a Super Admin). */
async function loadManagedProfile(session: Session, profileId: string): Promise<Profile | string> {
  if (!UUID.test(profileId)) return "Invalid account.";
  if (profileId === session.userId) return "Use Profile & Security to manage your own account.";
  const { data } = await createServiceClient().from("profiles").select("*").eq("id", profileId).maybeSingle<Profile>();
  if (!data || (data.role !== "admin" && data.role !== "official")) return "Account not found.";
  // Only the platform owner manages staff across hackathons.
  if (!isSuperAdmin(session) && data.hackathon_id !== session.hackathonId) return "Account not found.";
  if (!mayManage(session, data.role)) return "You cannot manage this account.";
  return data;
}

export type InviteState = { error?: string; link?: string; email?: string; name?: string; expiresAt?: string; roleLabel?: string };

const inviteSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Invalid phone number")]),
  job_title: z.string().trim().max(100),
  duty: z.string().trim().max(150),
  station: z.string().trim().max(100),
});

export async function inviteStaff(role: StaffRole, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireManager(role);
  const parsed = inviteSchema.safeParse({
    full_name: str(formData, "full_name"), email: str(formData, "email"), phone: str(formData, "phone"),
    job_title: str(formData, "job_title"), duty: str(formData, "duty"), station: str(formData, "station"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const service = createServiceClient(session.userId);
  const { data: existing } = await service.from("profiles").select("id").eq("email", d.email).maybeSingle();
  if (existing) return { error: "An account with this email already exists." };

  const permissions = sanitizeGrants(formData.getAll("permissions").map(String), role, {
    isSuperAdmin: isSuperAdmin(session),
    permissions: session.permissions,
  });
  const invitation = await createInvitation(session, {
    hackathonId: session.hackathonId,
    role, email: d.email, fullName: d.full_name, phone: d.phone, jobTitle: d.job_title, permissions,
    duty: role === "official" ? d.duty : null, station: role === "official" ? d.station : null,
  });
  await audit(session, "invitation.created", { type: "invitations", id: invitation.id }, { role, email: d.email, permissions });
  revalidatePath(pathFor(role));
  return { link: invitation.url, email: d.email, name: d.full_name, expiresAt: invitation.expiresAt, roleLabel: role === "admin" ? "Admin" : "Official" };
}

export async function sendPasswordReset(profileId: string, _prev: InviteState, _formData: FormData): Promise<InviteState> {
  const session = await requireStaff();
  const target = await loadManagedProfile(session, profileId);
  if (typeof target === "string") return { error: target };
  const invitation = await createInvitation(session, { role: target.role as StaffRole, purpose: "reset", email: target.email ?? "", profileId: target.id, fullName: target.full_name });
  return { link: invitation.url, email: target.email ?? "", name: target.full_name ?? "", expiresAt: invitation.expiresAt, roleLabel: "password reset" };
}

export async function updateStaffPermissions(profileId: string, formData: FormData) {
  const session = await requireStaff();
  const target = await loadManagedProfile(session, profileId);
  if (typeof target === "string") flash("/staff/users/officials", { error: target });
  const back = pathFor(target.role as StaffRole);
  const granter = { isSuperAdmin: isSuperAdmin(session), permissions: session.permissions };
  const wanted = sanitizeGrants(formData.getAll("permissions").map(String), target.role as StaffRole, granter);
  const service = createServiceClient(session.userId);
  const { data: current } = await service.from("staff_permissions").select("permission").eq("profile_id", profileId).returns<{ permission: string }[]>();
  const have = new Set((current ?? []).map((r) => r.permission));
  // A non-super granter can only add/remove permissions they hold themselves.
  const controllable = (p: string) => granter.isSuperAdmin || granter.permissions.has(p as never);
  const toRemove = [...have].filter((p) => controllable(p) && !wanted.includes(p as never));
  const toAdd = wanted.filter((p) => !have.has(p));
  if (toRemove.length) await service.from("staff_permissions").delete().eq("profile_id", profileId).in("permission", toRemove);
  if (toAdd.length) {
    const { error } = await service.from("staff_permissions").insert(toAdd.map((permission) => ({ profile_id: profileId, permission, granted_by: session.userId })));
    if (error) flash(back, { error: "Could not save permissions." });
  }
  await audit(session, "staff.permissions_changed", { type: "profiles", id: profileId }, { added: toAdd, removed: toRemove });
  revalidatePath(back);
  flash(back, { notice: `Permissions updated for ${target.full_name ?? target.email}.` });
}

export async function updateAssignment(profileId: string, formData: FormData) {
  const session = await requireStaff();
  const target = await loadManagedProfile(session, profileId);
  if (typeof target === "string" || target.role !== "official") flash("/staff/users/officials", { error: typeof target === "string" ? target : "Only Officials have duties." });
  const { error } = await createServiceClient(session.userId).from("official_assignments").upsert({
    profile_id: profileId, duty: str(formData, "duty", 150) || null, station: str(formData, "station", 100) || null,
    updated_by: session.userId, updated_at: new Date().toISOString(),
  });
  if (error) flash("/staff/users/officials", { error: "Could not save the assignment." });
  revalidatePath("/staff/users/officials");
  flash("/staff/users/officials", { notice: "Duty and station saved." });
}

export async function setStaffStatus(profileId: string, status: "active" | "suspended" | "deactivated") {
  const session = await requireStaff();
  const target = await loadManagedProfile(session, profileId);
  if (typeof target === "string") flash("/staff/users/officials", { error: target });
  const res = await setAccountStatus(session, profileId, status);
  const back = pathFor(target.role as StaffRole);
  revalidatePath(back);
  flash(back, res.ok ? { notice: res.message } : { error: res.error });
}

export async function changeStaffRole(profileId: string, formData: FormData) {
  const session = await requireStaff();
  if (!isSuperAdmin(session)) flash("/staff/forbidden", { error: "Only the Super Admin can change roles." });
  const target = await loadManagedProfile(session, profileId);
  if (typeof target === "string") flash("/staff/users/admins", { error: target });
  const role = z.enum(["official", "admin"]).safeParse(formData.get("role"));
  if (!role.success) flash("/staff/users/admins", { error: "Invalid role." });
  const service = createServiceClient(session.userId);
  await service.auth.admin.updateUserById(profileId, { app_metadata: { role: role.data } });
  const { error } = await service.from("profiles").update({ role: role.data }).eq("id", profileId);
  if (error) flash("/staff/users/admins", { error: "Could not change the role." });
  await audit(session, "staff.role_changed", { type: "profiles", id: profileId }, { from: target.role, to: role.data });
  revalidatePath("/staff/users/admins");
  revalidatePath("/staff/users/officials");
  flash(pathFor(role.data), { notice: `Role changed to ${role.data}. Review their permissions below.` });
}

export async function revokeStaffInvitation(invitationId: string) {
  const session = await requireStaff();
  if (!UUID.test(invitationId)) flash("/staff/users/officials", { error: "Invalid invitation." });
  const { data: inv } = await createServiceClient().from("invitations").select("*").eq("id", invitationId).maybeSingle<Invitation>();
  const sameHackathon = isSuperAdmin(session) || inv?.hackathon_id === session.hackathonId;
  if (!inv || (inv.role !== "admin" && inv.role !== "official") || !mayManage(session, inv.role) || !sameHackathon) flash("/staff/users/officials", { error: "Invitation not found." });
  await revokeInvitation(session, invitationId);
  revalidatePath(pathFor(inv.role as StaffRole));
  flash(pathFor(inv.role as StaffRole), { notice: `Invitation for ${inv.email} revoked.` });
}
