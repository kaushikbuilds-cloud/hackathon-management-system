"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Marks all visible notifications as read (RLS limits this to the user's own/team's). */
export async function markAllNotificationsRead(formData: FormData) {
  await requireSession();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  const back = String(formData.get("path") ?? "/");
  revalidatePath(back.startsWith("/") ? back : "/");
}
