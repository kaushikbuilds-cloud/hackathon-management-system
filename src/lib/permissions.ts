import type { AppRole } from "@/lib/domain/labels";

/**
 * Permission catalogue. MUST match the rows seeded into `public.permissions`
 * (supabase/migrations/20260925000005_roles_permissions.sql), which is what
 * the database enforces. The Super Admin implicitly holds every permission.
 */
export const PERMISSIONS = [
  { key: "manage_event", label: "Event settings", description: "Edit event setup, branding and the ID card template.", grantableTo: ["admin"], defaultFor: ["admin"] },
  { key: "manage_registrations", label: "Registration management", description: "Build and publish forms, view submissions, approve/reject teams, manage participant accounts.", grantableTo: ["admin"], defaultFor: ["admin"] },
  { key: "edit_registrations", label: "Correct registrations", description: "Correct team and participant details (audited).", grantableTo: ["admin", "official"], defaultFor: ["admin"] },
  { key: "view_participants", label: "Full participant data", description: "See all teams and participants including contact details.", grantableTo: ["admin"], defaultFor: ["admin"] },
  { key: "generate_pdf", label: "Generate ID cards", description: "Generate and download team ID card PDFs.", grantableTo: ["admin", "official"], defaultFor: ["admin"] },
  { key: "record_attendance", label: "QR check-in", description: "Scan ID card QR codes and confirm check-in.", grantableTo: ["admin", "official"], defaultFor: ["admin", "official"] },
  { key: "manual_checkin", label: "Manual check-in", description: "Search participants by name/ID and check them in manually.", grantableTo: ["admin", "official"], defaultFor: ["admin"] },
  { key: "correct_attendance", label: "Correct attendance", description: "Undo/correct check-ins with a reason (audited).", grantableTo: ["admin", "official"], defaultFor: ["admin"] },
  { key: "view_attendance", label: "Attendance dashboard", description: "See everyone's attendance, not just own check-ins.", grantableTo: ["admin", "official"], defaultFor: ["admin"] },
  { key: "manage_officials", label: "Manage Officials", description: "Invite, suspend and set permissions for Officials.", grantableTo: ["admin"], defaultFor: [] },
  { key: "publish_announcements", label: "Announcements & schedule", description: "Create, publish and archive announcements and schedule items.", grantableTo: ["admin"], defaultFor: ["admin"] },
  { key: "manage_all_support", label: "All support requests", description: "See, assign and handle every support request.", grantableTo: ["admin", "official"], defaultFor: ["admin"] },
  { key: "view_reports", label: "Reports & exports", description: "Dashboard statistics and CSV exports.", grantableTo: ["admin"], defaultFor: ["admin"] },
] as const satisfies readonly { key: string; label: string; description: string; grantableTo: readonly AppRole[]; defaultFor: readonly AppRole[] }[];

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as Permission[];

export function isPermission(value: string): value is Permission {
  return (PERMISSION_KEYS as string[]).includes(value);
}

export function grantableTo(role: "admin" | "official"): (typeof PERMISSIONS)[number][] {
  return PERMISSIONS.filter((p) => (p.grantableTo as readonly string[]).includes(role));
}

export function defaultPermissions(role: "admin" | "official"): Permission[] {
  return PERMISSIONS.filter((p) => (p.defaultFor as readonly string[]).includes(role)).map((p) => p.key);
}

export function permissionLabel(key: string): string {
  return PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}

/**
 * Filters requested grants to those valid for the invitee's role and, unless
 * the granter is the Super Admin, to permissions the granter holds — nobody
 * can hand out access they do not have.
 */
export function sanitizeGrants(
  requested: string[],
  inviteeRole: "admin" | "official",
  granter: { isSuperAdmin: boolean; permissions: ReadonlySet<string> },
): Permission[] {
  const allowed = new Set(grantableTo(inviteeRole).map((p) => p.key as string));
  return [...new Set(requested)].filter(
    (k): k is Permission => isPermission(k) && allowed.has(k) && (granter.isSuperAdmin || granter.permissions.has(k)),
  );
}
