import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { staffNav } from "@/components/layout/nav";
import { SubmitButton } from "@/components/client";
import { isSuperAdmin, portalName, requireStaff } from "@/lib/auth";
import { closeHackathon } from "./hackathons/actions";
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
      portalName={portalName(session)}
      eventName={hackathon?.name ?? (isSuperAdmin(session) ? "Platform" : "Hackathon")}
      nav={staffNav(session)}
      root="/staff"
      user={{ name: session.profile.full_name || session.email || "Staff", roleLabel: ROLE_LABEL[session.profile.role] }}
      unread={count ?? 0}
      notificationsHref="/staff/notifications"
    >
      {isSuperAdmin(session) && hackathon && (
        <form action={closeHackathon} className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm">
          <p className="text-slate-200">
            You are viewing <strong className="text-white">{hackathon.name}</strong> as the platform owner. Changes you make apply to this hackathon.
          </p>
          <SubmitButton size="sm" variant="secondary" pendingText="Closing…">Back to platform</SubmitButton>
        </form>
      )}
      {children}
    </AppShell>
  );
}
