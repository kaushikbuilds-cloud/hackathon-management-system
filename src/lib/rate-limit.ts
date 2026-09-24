import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { hashKey } from "@/lib/request";

export const LIMITS = {
  registration: { limit: 10, windowSeconds: 3600 },
  login: { limit: 10, windowSeconds: 900 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  supportCreate: { limit: 20, windowSeconds: 3600 },
} as const;

/**
 * Fixed-window rate limit stored in Postgres (works across serverless
 * instances). Returns true when the request is allowed. Fails open if the
 * limiter itself errors so a DB hiccup does not lock everybody out.
 */
export async function rateLimit(scope: keyof typeof LIMITS, identifier: string): Promise<boolean> {
  const { limit, windowSeconds } = LIMITS[scope];
  try {
    const { data, error } = await createServiceClient().rpc("check_rate_limit", {
      p_key: `${scope}:${hashKey(identifier)}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (e) {
    console.error("rate limiter unavailable", e instanceof Error ? e.message : e);
    return true;
  }
}
