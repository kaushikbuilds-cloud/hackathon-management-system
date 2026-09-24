import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { staffNav } from "@/components/layout/nav";
import { isAdmin, requireStaff } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Staff", template: "%s · Staff" } };

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const session = await requireStaff();
  const hackathon = await getHackathon();
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", session.userId)
    .is("read_at", null);
  return (
    <AppShell
      portalName={isAdmin(session) ? "Admin Portal" : "Official Portal"}
      eventName={hackathon?.name ?? "Hackathon"}
      nav={staffNav(session)}
      root="/staff"
      user={{ name: session.profile.full_name || session.email || "Staff", roleLabel: ROLE_LABEL[session.profile.role] }}
      unread={count ?? 0}
      notificationsHref="/staff/notifications"
    >
      {children}
    </AppShell>
  );
}
