import type { IconName } from "@/components/icons";
import { can, canAny, isSuperAdmin, type Session } from "@/lib/auth";

export type NavItem = { href: string; label: string; icon: IconName };

/** Staff navigation per portal (Super Admin / Admin / Official), filtered by permissions. */
export function staffNav(session: Session): NavItem[] {
  const sa = isSuperAdmin(session);
  const official = session.profile.role === "official";
  // The Super Admin sees event pages only while a hackathon is open.
  const inEvent = Boolean(session.hackathonId);
  const ev = (show: boolean) => show && inEvent;
  const items: (NavItem & { show: boolean })[] = [
    { href: "/staff", label: sa && !inEvent ? "Platform Dashboard" : "Dashboard", icon: "dashboard", show: true },
    { href: "/staff/hackathons", label: "Hackathons", icon: "trophy", show: sa },
    { href: "/staff/monthly-reports", label: "Monthly Reports", icon: "chart", show: sa },
    { href: "/staff/event", label: sa ? "Hackathon / Event Setup" : "Event Setup", icon: "settings", show: ev(can(session, "manage_event")) },
    { href: "/staff/brand", label: "Brand Kit", icon: "palette", show: ev(can(session, "manage_event")) },
    { href: "/staff/users/admins", label: "User Management", icon: "shield", show: ev(sa) },
    { href: "/staff/users/officials", label: "Officials Management", icon: "users", show: ev(!sa && can(session, "manage_officials")) },
    { href: "/staff/forms", label: sa ? "Registration Management" : "Form Builder & Submissions", icon: "form", show: ev(can(session, "manage_registrations")) },
    { href: "/staff/teams", label: sa ? "Teams & Participants" : "Team Management", icon: "table", show: ev(canAny(session, ["view_participants", "edit_registrations", "manage_registrations"])) },
    { href: "/staff/participants", label: "Participant Management", icon: "user", show: ev(!sa && can(session, "view_participants")) },
    { href: "/staff/id-cards", label: sa ? "ID Card Management" : "ID Card / PDF Generation", icon: "idcard", show: ev(canAny(session, ["generate_pdf", "manage_event"])) },
    { href: "/staff/attendance", label: official ? "QR Scanner" : "Attendance", icon: "qr", show: ev(canAny(session, ["record_attendance", "view_attendance"])) },
    { href: "/staff/attendance/manual", label: "Manual Check-in", icon: "search", show: ev(can(session, "manual_checkin")) },
    { href: "/staff/attendance/history", label: "Attendance History", icon: "history", show: ev(canAny(session, ["record_attendance", "manual_checkin", "view_attendance"])) },
    { href: "/staff/food", label: "Food Orders", icon: "food", show: ev(can(session, "manage_food")) },
    { href: "/staff/announcements", label: official ? "Announcements & Instructions" : "Announcements & Schedule", icon: "megaphone", show: inEvent },
    { href: "/staff/faq", label: "FAQ", icon: "help", show: ev(can(session, "publish_announcements")) },
    { href: "/staff/support", label: official ? "Assigned Help Desk" : "Support Requests", icon: "help", show: inEvent },
    { href: "/staff/reports", label: "Reports & Export", icon: "chart", show: ev(can(session, "view_reports")) },
    { href: "/staff/certificates", label: "Certificates", icon: "idcard", show: ev(can(session, "manage_event")) },
    { href: "/staff/end", label: "End Hackathon", icon: "trophy", show: ev(can(session, "manage_event")) },
    { href: "/staff/audit", label: "Audit Logs", icon: "audit", show: sa },
    { href: "/staff/system", label: "System Settings", icon: "server", show: sa },
    { href: "/staff/settings", label: "Profile & Security", icon: "user", show: true },
  ];
  return items.filter((i) => i.show).map(({ show: _show, ...i }) => i);
}
