import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Supabase client bound to the signed-in user's session (cookies).
 * All queries run under the user's JWT, so Row Level Security applies.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = publicEnv();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by proxy.ts instead.
        }
      },
    },
  });
}

/**
 * Service-role client that BYPASSES RLS. Server-only; use it only after an
 * explicit permission check. `actorId` is forwarded so database audit
 * triggers attribute changes to the real user.
 */
export function createServiceClient(actorId?: string | null): SupabaseClient {
  const { supabaseUrl } = publicEnv();
  const { serviceRoleKey } = serverEnv();
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: actorId ? { "x-actor-id": actorId } : {} },
  });
}
