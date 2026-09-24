import "server-only";
import { appUrl, settings } from "@/lib/env";
import { audit } from "@/lib/audit";
import type { Session } from "@/lib/auth";
import { generateTemporaryPassword } from "@/lib/domain/password";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/domain/labels";

type ParticipantRef = { id: string; email: string; full_name: string; user_id: string | null };

export type CredentialResult = { ok: true; tempPassword?: string; message: string } | { ok: false; error: string };

function expiry(): string {
  return new Date(Date.now() + settings.tempPasswordTtlHours * 3600_000).toISOString();
}

async function recordCredentialEvent(actor: Session | null, eventType: string, refs: { profileId?: string | null; participantId?: string | null }, note?: string) {
  await createServiceClient(actor?.userId).from("credential_events").insert({
    profile_id: refs.profileId ?? null,
    participant_id: refs.participantId ?? null,
    event_type: eventType,
    actor_id: actor?.userId ?? null,
    note: note ?? null,
  });
  await audit(actor, `credentials.${eventType}`, { type: refs.participantId ? "participants" : "profiles", id: refs.participantId ?? refs.profileId ?? null });
}

/** Links an auth user to a participant (role + app_metadata + both FK sides). */
export async function linkParticipantAccount(userId: string, participantId: string) {
  const service = createServiceClient();
  await service.auth.admin.updateUserById(userId, { app_metadata: { role: "participant", participant_id: participantId } });
  await service.from("profiles").update({ role: "participant", participant_id: participantId }).eq("id", userId);
  await service.from("participants").update({ user_id: userId }).eq("id", participantId);
}

/**
 * Issues a short-lived temporary password for a participant's individual
 * account (creating the account if needed). The password is returned ONCE to
 * the caller for hand-over and is never stored or logged; the user must change
 * it at first sign-in and it expires after TEMP_PASSWORD_TTL_HOURS.
 */
export async function issueParticipantTempPassword(actor: Session, p: ParticipantRef): Promise<CredentialResult> {
  const service = createServiceClient(actor.userId);
  const password = generateTemporaryPassword();
  const expiresAt = expiry();
  let userId = p.user_id;

  if (userId) {
    const { error } = await service.auth.admin.updateUserById(userId, { password, ban_duration: "none" });
    if (error) return { ok: false, error: `Could not reset the password: ${error.message}` };
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email: p.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: p.full_name },
      app_metadata: { role: "participant", participant_id: p.id, must_change_password: true, temp_password_expires_at: expiresAt },
    });
    if (error || !data.user) {
      return { ok: false, error: `Could not create the account: ${error?.message ?? "unknown error"}. The email may already belong to another account.` };
    }
    userId = data.user.id;
  }
  await service.from("profiles").update({ must_change_password: true, temp_password_expires_at: expiresAt, is_active: true }).eq("id", userId);
  await recordCredentialEvent(actor, "temp_password_issued", { profileId: userId, participantId: p.id }, `Expires ${expiresAt}`);
  return { ok: true, tempPassword: password, message: `Temporary password issued. It expires in ${settings.tempPasswordTtlHours} hours and must be changed at first sign-in.` };
}

/**
 * Sends an activation email (Supabase invite) or, for an existing account, a
 * password-reset email. Requires Supabase SMTP and the email templates
 * described in README.md.
 */
export async function sendParticipantActivation(actor: Session | null, p: ParticipantRef): Promise<CredentialResult> {
  const service = createServiceClient(actor?.userId);
  const redirectTo = `${appUrl()}/auth/confirm?next=/change-password`;
  if (p.user_id) {
    const { error } = await service.auth.resetPasswordForEmail(p.email, { redirectTo });
    if (error) return { ok: false, error: `Could not send reset email: ${error.message}` };
    await recordCredentialEvent(actor, "password_reset_sent", { profileId: p.user_id, participantId: p.id });
    return { ok: true, message: `Password reset email sent to ${p.email}.` };
  }
  const { data, error } = await service.auth.admin.inviteUserByEmail(p.email, { data: { full_name: p.full_name }, redirectTo });
  if (error || !data.user) return { ok: false, error: `Could not send invite: ${error?.message ?? "unknown error"}` };
  await linkParticipantAccount(data.user.id, p.id);
  await recordCredentialEvent(actor, "invite_sent", { profileId: data.user.id, participantId: p.id });
  return { ok: true, message: `Activation email sent to ${p.email}.` };
}

/** Creates a staff account (official/admin) with a temporary password. */
export async function createStaffAccount(
  actor: Session,
  input: { email: string; fullName: string; role: Exclude<AppRole, "participant"> },
): Promise<CredentialResult & { userId?: string }> {
  const service = createServiceClient(actor.userId);
  const password = generateTemporaryPassword();
  const expiresAt = expiry();
  const { data, error } = await service.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
    app_metadata: { role: input.role, must_change_password: true, temp_password_expires_at: expiresAt },
  });
  if (error || !data.user) return { ok: false, error: `Could not create the account: ${error?.message ?? "unknown error"}` };
  await recordCredentialEvent(actor, "temp_password_issued", { profileId: data.user.id }, `New ${input.role} account`);
  await audit(actor, "staff.created", { type: "profiles", id: data.user.id }, { role: input.role, email: input.email });
  return { ok: true, userId: data.user.id, tempPassword: password, message: `Account created. Share the temporary password securely; it expires in ${settings.tempPasswordTtlHours} hours.` };
}

export async function resetStaffPassword(actor: Session, profileId: string): Promise<CredentialResult> {
  const service = createServiceClient(actor.userId);
  const password = generateTemporaryPassword();
  const expiresAt = expiry();
  const { error } = await service.auth.admin.updateUserById(profileId, { password });
  if (error) return { ok: false, error: `Could not reset the password: ${error.message}` };
  await service.from("profiles").update({ must_change_password: true, temp_password_expires_at: expiresAt }).eq("id", profileId);
  await recordCredentialEvent(actor, "temp_password_issued", { profileId }, "Password reset by administrator");
  return { ok: true, tempPassword: password, message: "Temporary password issued." };
}

/** Deactivates/reactivates an account; deactivation also bans the auth user so existing sessions stop refreshing. */
export async function setAccountActive(actor: Session, profileId: string, active: boolean): Promise<CredentialResult> {
  const service = createServiceClient(actor.userId);
  const { error } = await service.auth.admin.updateUserById(profileId, { ban_duration: active ? "none" : "876000h" });
  if (error) return { ok: false, error: error.message };
  await service.from("profiles").update({ is_active: active }).eq("id", profileId);
  await recordCredentialEvent(actor, active ? "account_reactivated" : "account_deactivated", { profileId });
  return { ok: true, message: active ? "Account reactivated." : "Account deactivated." };
}

export { recordCredentialEvent };
