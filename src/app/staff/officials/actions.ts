"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createStaffAccount, resetStaffPassword, setAccountActive } from "@/lib/accounts";
import { UUID, bool, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireAdmin, type Session } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type StaffCredentialState = { error?: string; message?: string; tempPassword?: string; forName?: string };

async function loadTarget(session: Session, profileId: string): Promise<Profile | string> {
  if (!UUID.test(profileId)) return "Invalid account.";
  const { data } = await createServiceClient().from("profiles").select("*").eq("id", profileId).maybeSingle<Profile>();
  if (!data || data.role === "participant") return "Account not found.";
  if (data.id === session.userId) return "Use Settings to manage your own account.";
  // Admins manage officials; only super admins manage admins.
  if (data.role !== "official" && session.profile.role !== "super_admin") return "Only a super admin can manage administrator accounts.";
  return data;
}

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  full_name: z.string().trim().min(2, "Name is required").max(100),
  role: z.enum(["official", "admin"]),
});

export async function createStaff(_prev: StaffCredentialState, formData: FormData): Promise<StaffCredentialState> {
  const session = await requireAdmin();
  const parsed = createSchema.safeParse({ email: str(formData, "email"), full_name: str(formData, "full_name"), role: str(formData, "role") || "official" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.role === "admin" && session.profile.role !== "super_admin") return { error: "Only a super admin can create administrators." };
  const res = await createStaffAccount(session, { email: parsed.data.email, fullName: parsed.data.full_name, role: parsed.data.role });
  if (!res.ok) return { error: res.error };
  if (parsed.data.role === "official" && res.userId) {
    await createServiceClient(session.userId).from("official_permissions").upsert({
      profile_id: res.userId,
      can_edit_registrations: bool(formData, "can_edit_registrations"),
      can_generate_pdf: bool(formData, "can_generate_pdf"),
      can_correct_attendance: bool(formData, "can_correct_attendance"),
      can_manage_all_support: bool(formData, "can_manage_all_support"),
      updated_by: session.userId,
    });
  }
  revalidatePath("/staff/officials");
  return { message: res.message, tempPassword: res.tempPassword, forName: parsed.data.full_name };
}

export async function updatePermissions(profileId: string, formData: FormData) {
  const session = await requireAdmin();
  const target = await loadTarget(session, profileId);
  if (typeof target === "string") flash("/staff/officials", { error: target });
  if (target.role !== "official") flash("/staff/officials", { error: "Permissions apply to officials only; admins have full access." });
  const perms = {
    can_edit_registrations: bool(formData, "can_edit_registrations"),
    can_generate_pdf: bool(formData, "can_generate_pdf"),
    can_correct_attendance: bool(formData, "can_correct_attendance"),
    can_manage_all_support: bool(formData, "can_manage_all_support"),
  };
  const { error } = await createServiceClient(session.userId).from("official_permissions").upsert({ profile_id: profileId, ...perms, updated_by: session.userId, updated_at: new Date().toISOString() });
  if (error) flash("/staff/officials", { error: "Could not save permissions." });
  revalidatePath("/staff/officials");
  flash("/staff/officials", { notice: `Permissions updated for ${target.full_name ?? target.email}.` });
}

export async function changeRole(profileId: string, formData: FormData) {
  const session = await requireAdmin();
  if (session.profile.role !== "super_admin") flash("/staff/officials", { error: "Only a super admin can change roles." });
  const target = await loadTarget(session, profileId);
  if (typeof target === "string") flash("/staff/officials", { error: target });
  const role = z.enum(["official", "admin", "super_admin"]).safeParse(formData.get("role"));
  if (!role.success) flash("/staff/officials", { error: "Invalid role." });
  const service = createServiceClient(session.userId);
  await service.auth.admin.updateUserById(profileId, { app_metadata: { role: role.data } });
  const { error } = await service.from("profiles").update({ role: role.data }).eq("id", profileId);
  if (error) flash("/staff/officials", { error: "Could not change role." });
  if (role.data === "official") await service.from("official_permissions").upsert({ profile_id: profileId }, { onConflict: "profile_id", ignoreDuplicates: true });
  await audit(session, "staff.role_changed", { type: "profiles", id: profileId }, { from: target.role, to: role.data });
  revalidatePath("/staff/officials");
  flash("/staff/officials", { notice: `Role changed to ${role.data}.` });
}

export async function toggleStaffActive(profileId: string, active: boolean) {
  const session = await requireAdmin();
  const target = await loadTarget(session, profileId);
  if (typeof target === "string") flash("/staff/officials", { error: target });
  const res = await setAccountActive(session, profileId, active);
  revalidatePath("/staff/officials");
  flash("/staff/officials", res.ok ? { notice: res.message } : { error: res.error });
}

export async function resetStaff(profileId: string, _prev: StaffCredentialState, _formData: FormData): Promise<StaffCredentialState> {
  const session = await requireAdmin();
  const target = await loadTarget(session, profileId);
  if (typeof target === "string") return { error: target };
  const res = await resetStaffPassword(session, profileId);
  return res.ok ? { message: res.message, tempPassword: res.tempPassword, forName: target.full_name ?? target.email ?? "" } : { error: res.error };
}
