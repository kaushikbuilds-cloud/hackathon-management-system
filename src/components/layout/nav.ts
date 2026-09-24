import { can, isAdmin, type Session } from "@/lib/auth";

export type NavItem = { href: string; label: string; icon: string };

/** Staff navigation, filtered by role and official permissions. */
export function staffNav(session: Session): NavItem[] {
  const admin = isAdmin(session);
  const items: (NavItem & { show: boolean })[] = [
    { href: "/staff", label: "Dashboard", icon: "◧", show: admin },
    { href: "/staff/event", label: "Event Setup", icon: "⚙", show: admin },
    { href: "/staff/forms", label: "Form Builder", icon: "✎", show: admin },
    { href: "/staff/teams", label: "Teams", icon: "▦", show: true },
    { href: "/staff/participants", label: "Participants", icon: "☺", show: true },
    { href: "/staff/id-cards", label: "ID Card Generation", icon: "▭", show: admin || can(session, "generate_pdf") },
    { href: "/staff/attendance", label: "Attendance", icon: "✓", show: true },
    { href: "/staff/officials", label: "Officials & Permissions", icon: "⚑", show: admin },
    { href: "/staff/support", label: "Help & Support", icon: "?", show: true },
    { href: "/staff/announcements", label: "Announcements & Schedule", icon: "✉", show: true },
    { href: "/staff/reports", label: "Reports", icon: "▤", show: admin },
    { href: "/staff/audit", label: "Audit Logs", icon: "☰", show: admin },
    { href: "/staff/settings", label: "Settings", icon: "⚙", show: true },
  ];
  return items.filter((i) => i.show).map(({ show: _show, ...i }) => i);
}
