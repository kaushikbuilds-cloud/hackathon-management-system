import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OfficialPermissions, Permission, Profile } from "@/lib/types";

export type Session = {
  userId: string;
  email: string | null;
  profile: Profile;
  permissions: OfficialPermissions | null;
};

/** Current user + profile, memoised per request. Returns null when signed out or deactivated. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  if (!profile || !profile.is_active) return null;
  let permissions: OfficialPermissions | null = null;
  if (profile.role === "official") {
    const { data } = await supabase.from("official_permissions").select("*").eq("profile_id", user.id).maybeSingle<OfficialPermissions>();
    permissions = data ?? null;
  }
  return { userId: user.id, email: user.email ?? null, profile, permissions };
});

export function isAdmin(session: Session | null): boolean {
  return session?.profile.role === "admin" || session?.profile.role === "super_admin";
}

export function isStaff(session: Session | null): boolean {
  return isAdmin(session) || session?.profile.role === "official";
}

/** Mirrors `public.has_permission`: admins hold every permission. */
export function can(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  if (isAdmin(session)) return true;
  if (session.profile.role !== "official" || !session.permissions) return false;
  const p = session.permissions;
  return {
    edit_registrations: p.can_edit_registrations,
    generate_pdf: p.can_generate_pdf,
    correct_attendance: p.can_correct_attendance,
    manage_all_support: p.can_manage_all_support,
  }[permission];
}

export function homePathFor(role: Profile["role"]): string {
  if (role === "participant") return "/portal";
  if (role === "official") return "/staff/attendance";
  return "/staff";
}

type RequireOptions = { allowPasswordChange?: boolean };

export async function requireSession(options: RequireOptions = {}): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.must_change_password && !options.allowPasswordChange) redirect("/change-password");
  return session;
}

export async function requireStaff(): Promise<Session> {
  const session = await requireSession();
  if (!isStaff(session)) redirect(homePathFor(session.profile.role));
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!isAdmin(session)) redirect(isStaff(session) ? "/staff/forbidden" : homePathFor(session.profile.role));
  return session;
}

export async function requireSuperAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.profile.role !== "super_admin") redirect("/staff/forbidden");
  return session;
}

export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireStaff();
  if (!can(session, permission)) redirect("/staff/forbidden");
  return session;
}

export async function requireParticipant(): Promise<Session & { participantId: string }> {
  const session = await requireSession();
  if (session.profile.role !== "participant") redirect(homePathFor(session.profile.role));
  if (!session.profile.participant_id) redirect("/login?error=no_team");
  return { ...session, participantId: session.profile.participant_id };
}
