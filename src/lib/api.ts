import "server-only";
import { NextResponse } from "next/server";
import { canAny, getSession, isStaff, isSuperAdmin, type Session } from "@/lib/auth";
import type { Permission } from "@/lib/types";

type Guard<S = Session> = { session: S; response?: never } | { session?: never; response: NextResponse };
export type ScopedSession = Session & { hackathonId: string };

/** Auth guard for route handlers: returns a JSON error response instead of redirecting. */
export async function guardApi(requirement: "staff" | "super_admin"): Promise<Guard>;
/** Permission checks also require a hackathon context (the data they protect belongs to one). */
export async function guardApi(requirement: Permission | Permission[]): Promise<Guard<ScopedSession>>;
export async function guardApi(requirement: "staff" | "super_admin" | Permission | Permission[]): Promise<Guard>;
export async function guardApi(requirement: "staff" | "super_admin" | Permission | Permission[]): Promise<Guard | Guard<ScopedSession>> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (session.profile.must_change_password) return { response: NextResponse.json({ error: "Password change required" }, { status: 403 }) };
  const ok =
    requirement === "staff" ? isStaff(session)
    : requirement === "super_admin" ? isSuperAdmin(session)
    : canAny(session, Array.isArray(requirement) ? requirement : [requirement]);
  if (!ok) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (requirement !== "staff" && requirement !== "super_admin" && !session.hackathonId) {
    return { response: NextResponse.json({ error: "Open a hackathon first." }, { status: 409 }) };
  }
  return { session };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
