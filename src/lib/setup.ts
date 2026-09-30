import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/** Whether the one-time Super Admin setup has been done (server only, not a callable action). */
export async function superAdminExists(): Promise<boolean> {
  const { count } = await createServiceClient().from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  return (count ?? 0) > 0;
}
