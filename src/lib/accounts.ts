import "server-only";
import { audit } from "@/lib/audit";
import type { Session } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export type AccountStatus = "active" | "suspended" | "deactivated";

export type AccountResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Moves an account through the lifecycle. Suspending or deactivating also bans
 * the auth user so existing sessions stop refreshing; database policies deny
 * access immediately because every permission helper checks the status.
 * Callers must have checked that `actor` may manage this account.
 */
export async function setAccountStatus(actor: Session, profileId: string, status: AccountStatus): Promise<AccountResult> {
  const service = createServiceClient(actor.userId);
  const { error } = await service.auth.admin.updateUserById(profileId, { ban_duration: status === "active" ? "none" : "876000h" });
  if (error) return { ok: false, error: error.message };
  const { error: dbError } = await service.from("profiles").update({ status }).eq("id", profileId);
  if (dbError) return { ok: false, error: dbError.message };
  const eventType = status === "active" ? "account_reactivated" : status === "suspended" ? "account_suspended" : "account_deactivated";
  await service.from("credential_events").insert({ profile_id: profileId, event_type: eventType, actor_id: actor.userId });
  await audit(actor, `account.${status}`, { type: "profiles", id: profileId });
  return { ok: true, message: status === "active" ? "Account reactivated." : status === "suspended" ? "Account suspended." : "Account deactivated." };
}

export async function recordCredentialEvent(actor: Pick<Session, "userId" | "profile"> | null, eventType: string, refs: { profileId?: string | null; participantId?: string | null }, note?: string) {
  await createServiceClient(actor?.userId).from("credential_events").insert({
    profile_id: refs.profileId ?? null,
    participant_id: refs.participantId ?? null,
    event_type: eventType,
    actor_id: actor?.userId ?? null,
    note: note ?? null,
  });
  await audit(actor, `credentials.${eventType}`, { type: refs.participantId ? "participants" : "profiles", id: refs.participantId ?? refs.profileId ?? null });
}
