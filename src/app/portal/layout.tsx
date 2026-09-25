import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import type { NavItem } from "@/components/layout/nav";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Team Portal", template: "%s · Team Portal" } };

const NAV: NavItem[] = [
  { href: "/portal", label: "Dashboard", icon: "dashboard" },
  { href: "/portal/schedule", label: "Announcements & Schedule", icon: "calendar" },
  { href: "/portal/support", label: "Help & Support", icon: "help" },
  { href: "/portal/profile", label: "Profile & Security", icon: "user" },
];

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const session = await requireParticipant();
  const hackathon = await getHackathon();
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return (
    <AppShell
      portalName="Team Portal"
      eventName={hackathon?.name ?? "Hackathon"}
      nav={NAV}
      root="/portal"
      user={{ name: session.profile.full_name || session.email || "Participant", roleLabel: "Participant" }}
      unread={count ?? 0}
      notificationsHref="/portal/notifications"
    >
      {children}
    </AppShell>
  );
}
