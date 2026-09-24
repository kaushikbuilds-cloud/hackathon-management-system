import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/auth";

/**
 * Explicit audit entry for actions that are not captured by row triggers
 * (sign-ins, PDF generation, credential events). Never pass secrets in `details`.
 */
export async function audit(
  actor: Pick<Session, "userId" | "profile"> | null,
  action: string,
  entity: { type?: string; id?: string | null } = {},
  details: Record<string, unknown> = {},
) {
  const { error } = await createServiceClient().from("audit_logs").insert({
    actor_id: actor?.userId ?? null,
    actor_role: actor?.profile.role ?? null,
    action,
    entity_type: entity.type ?? null,
    entity_id: entity.id ?? null,
    details,
  });
  if (error) console.error("audit log write failed", action, error.message);
}
