import { can, canAny, isSuperAdmin, type Session } from "@/lib/auth";

export type NavItem = { href: string; label: string; icon: string };

/** Staff navigation per portal (Super Admin / Admin / Official), filtered by permissions. */
export function staffNav(session: Session): NavItem[] {
  const sa = isSuperAdmin(session);
  const official = session.profile.role === "official";
  const items: (NavItem & { show: boolean })[] = [
    { href: "/staff", label: "Dashboard", icon: "◧", show: true },
    { href: "/staff/event", label: sa ? "Hackathon / Event Setup" : "Event Setup", icon: "⚙", show: can(session, "manage_event") },
    { href: "/staff/users/admins", label: "User Management", icon: "⚑", show: sa },
    { href: "/staff/users/officials", label: "Officials Management", icon: "⚑", show: !sa && can(session, "manage_officials") },
    { href: "/staff/forms", label: sa ? "Registration Management" : "Form Builder & Submissions", icon: "✎", show: can(session, "manage_registrations") },
    { href: "/staff/teams", label: sa ? "Teams & Participants" : "Team Management", icon: "▦", show: canAny(session, ["view_participants", "edit_registrations", "manage_registrations"]) },
    { href: "/staff/participants", label: "Participant Management", icon: "☺", show: !sa && can(session, "view_participants") },
    { href: "/staff/id-cards", label: sa ? "ID Card Management" : "ID Card / PDF Generation", icon: "▭", show: canAny(session, ["generate_pdf", "manage_event"]) },
    { href: "/staff/attendance", label: official ? "QR Scanner" : "Attendance", icon: "✓", show: canAny(session, ["record_attendance", "view_attendance"]) },
    { href: "/staff/attendance/manual", label: "Manual Check-in", icon: "⌕", show: can(session, "manual_checkin") },
    { href: "/staff/attendance/history", label: "Attendance History", icon: "☰", show: canAny(session, ["record_attendance", "manual_checkin", "view_attendance"]) },
    { href: "/staff/announcements", label: official ? "Announcements & Instructions" : "Announcements & Schedule", icon: "✉", show: true },
    { href: "/staff/support", label: official ? "Assigned Help Desk" : "Support Requests", icon: "?", show: true },
    { href: "/staff/reports", label: "Reports & Export", icon: "▤", show: can(session, "view_reports") },
    { href: "/staff/audit", label: "Audit Logs", icon: "☰", show: sa },
    { href: "/staff/system", label: "System Settings", icon: "⚙", show: sa },
    { href: "/staff/settings", label: "Profile & Security", icon: "☺", show: true },
  ];
  return items.filter((i) => i.show).map(({ show: _show, ...i }) => i);
}
