import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HACKATHON_COOKIE, parseHackathonId } from "@/lib/hackathon-context";
import { requestTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { isPermission, type Permission } from "@/lib/permissions";
import type { Profile } from "@/lib/types";

export type Session = {
  userId: string;
  email: string | null;
  profile: Profile;
  /** Explicit grants (empty for participants). The Super Admin implicitly holds all. */
  permissions: ReadonlySet<Permission>;
  /**
   * The hackathon this session works in: the person's own hackathon, or for
   * the Super Admin the one they opened (null = platform view).
   */
  hackathonId: string | null;
};

/**
 * Team, member and shop logins belong to one hackathon and stop working once
 * it has ended (a shop's also a day after the end date). Staff keep access.
 */
export async function loginClosed(profile: Pick<Profile, "role" | "hackathon_id">): Promise<boolean> {
  if ((profile.role !== "participant" && profile.role !== "vendor") || !profile.hackathon_id) return false;
  const { data: h } = await (await createClient()).from("hackathons").select("ends_at, status").eq("id", profile.hackathon_id).maybeSingle<{ ends_at: string | null; status: string }>();
  if (h?.status === "completed") return true;
  return profile.role === "vendor" && Boolean(h?.ends_at && Date.parse(h.ends_at) + 24 * 3600_000 < requestTime());
}

const loadSession = cache(async (): Promise<{ session: Session | null; closed: boolean }> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { session: null, closed: false };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  if (!profile || profile.status !== "active") return { session: null, closed: false };
  if (await loginClosed(profile)) return { session: null, closed: true };
  let permissions = new Set<Permission>();
  if (profile.role === "admin" || profile.role === "official") {
    const { data } = await supabase.from("staff_permissions").select("permission").eq("profile_id", user.id).returns<{ permission: string }[]>();
    permissions = new Set((data ?? []).map((r) => r.permission).filter(isPermission));
  }
  let hackathonId = profile.hackathon_id;
  if (profile.role === "super_admin") {
    const requested = parseHackathonId((await cookies()).get(HACKATHON_COOKIE)?.value);
    hackathonId = requested
      ? ((await supabase.from("hackathons").select("id").eq("id", requested).maybeSingle<{ id: string }>()).data?.id ?? null)
      : null;
  }
  return { session: { userId: user.id, email: user.email ?? null, profile, permissions, hackathonId }, closed: false };
});

/** Current user + profile + grants, memoised per request. Null when signed out, not active, or the login has closed. */
export async function getSession(): Promise<Session | null> {
  return (await loadSession()).session;
}

/** True when someone is still signed in with a team or shop login whose hackathon has ended. */
export async function hasClosedLogin(): Promise<boolean> {
  return (await loadSession()).closed;
}

export function isSuperAdmin(session: Session | null): boolean {
  return session?.profile.role === "super_admin";
}

/** Admin or Super Admin (portal identity, not a permission check). */
export function isAdmin(session: Session | null): boolean {
  return session?.profile.role === "admin" || session?.profile.role === "super_admin";
}

export function isStaff(session: Session | null): boolean {
  return isAdmin(session) || session?.profile.role === "official";
}

/** Mirrors `public.has_permission`. */
export function can(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  if (isSuperAdmin(session)) return true;
  return isStaff(session) && session.permissions.has(permission);
}

export function canAny(session: Session | null, permissions: Permission[]): boolean {
  return permissions.some((p) => can(session, p));
}

export function homePathFor(role: Profile["role"]): string {
  return role === "participant" ? "/portal" : role === "vendor" ? "/shop" : "/staff";
}

export function portalName(session: Session): string {
  return { super_admin: "Super Admin Portal", admin: "Admin Portal", official: "Official Portal", participant: "Team Portal", vendor: "Shop Portal" }[session.profile.role];
}

type RequireOptions = { allowPasswordChange?: boolean };

export async function requireSession(options: RequireOptions = {}): Promise<Session> {
  const { session, closed } = await loadSession();
  if (!session) redirect(closed ? "/auth/signout?reason=ended" : "/login");
  if (session.profile.must_change_password && !options.allowPasswordChange) redirect("/change-password");
  return session;
}

export async function requireStaff(): Promise<Session> {
  const session = await requireSession();
  if (!isStaff(session)) redirect(homePathFor(session.profile.role));
  return session;
}

export async function requireSuperAdmin(): Promise<Session> {
  const session = await requireStaff();
  if (!isSuperAdmin(session)) redirect("/staff/forbidden");
  return session;
}

/**
 * Requires at least one of the given permissions inside a hackathon. The
 * Super Admin must open a hackathon first (event pages have no meaning at
 * platform level).
 */
export async function requirePermission(...permissions: Permission[]): Promise<Session & { hackathonId: string }> {
  const session = await requireStaff();
  if (!canAny(session, permissions)) redirect("/staff/forbidden");
  return requireHackathon(session);
}

export function requireHackathon<S extends Session>(session: S): S & { hackathonId: string } {
  if (!session.hackathonId) redirect(isSuperAdmin(session) ? "/staff/hackathons?notice=Open+a+hackathon+first." : "/staff/forbidden");
  return session as S & { hackathonId: string };
}

/**
 * A team member in the portal. Teams share one login (`isTeamAccount`, no
 * participantId); older per-member accounts carry their participantId.
 */
export async function requireParticipant(): Promise<Session & { participantId: string | null; isTeamAccount: boolean }> {
  const session = await requireSession();
  if (session.profile.role !== "participant") redirect(homePathFor(session.profile.role));
  const isTeamAccount = Boolean(session.profile.team_id);
  if (!session.profile.participant_id && !isTeamAccount) redirect("/login?error=no_team");
  return { ...session, participantId: session.profile.participant_id, isTeamAccount };
}

/** A food shop's own login: its orders and menu only. */
export async function requireVendor(): Promise<Session & { shopId: string; hackathonId: string }> {
  const session = await requireSession();
  if (session.profile.role !== "vendor") redirect(homePathFor(session.profile.role));
  if (!session.profile.shop_id || !session.hackathonId) redirect("/login?error=no_shop");
  return { ...session, shopId: session.profile.shop_id, hackathonId: session.hackathonId };
}
