import { NotificationList } from "@/components/notification-list";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";

export default async function StaffNotificationsPage() {
  const session = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("profile_id", session.userId).order("created_at", { ascending: false }).limit(100).returns<Notification[]>();
  const hackathon = await getHackathon();
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationList items={data ?? []} path="/staff/notifications" timeZone={hackathon?.timezone ?? "UTC"} />
    </>
  );
}
