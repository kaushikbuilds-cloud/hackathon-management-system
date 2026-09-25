import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { appUrl, settings } from "@/lib/env";
import { audit } from "@/lib/audit";
import type { Session } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import type { Invitation } from "@/lib/types";

export type InvitationState = "pending" | "accepted" | "revoked" | "expired";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationState(inv: Pick<Invitation, "accepted_at" | "revoked_at" | "expires_at">, now = new Date()): InvitationState {
  if (inv.accepted_at) return "accepted";
  if (inv.revoked_at) return "revoked";
  if (new Date(inv.expires_at) <= now) return "expired";
  return "pending";
}

export type NewInvitation = {
  role: "admin" | "official" | "participant";
  purpose?: "activate" | "reset";
  email: string;
  fullName?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  permissions?: Permission[];
  duty?: string | null;
  station?: string | null;
  participantId?: string | null;
  profileId?: string | null;
};

export type CreatedInvitation = { id: string; url: string; expiresAt: string; email: string; role: NewInvitation["role"]; purpose: "activate" | "reset" };

/**
 * Creates a single-use, expiring invitation and returns its link. Only a
 * SHA-256 hash of the token is stored, so the link can be shown exactly once.
 * Any earlier pending invitation for the same person and purpose is revoked.
 * Callers must have checked that `actor` may issue this invitation.
 */
export async function createInvitation(actor: Session | null, input: NewInvitation): Promise<CreatedInvitation> {
  const service = createServiceClient(actor?.userId);
  const purpose = input.purpose ?? "activate";
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString("base64url");
  const hours = input.role === "participant" ? settings.participantInviteTtlHours : settings.staffInviteTtlHours;
  const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();

  await service
    .from("invitations")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor?.userId ?? null })
    .eq("email", email)
    .eq("role", input.role)
    .eq("purpose", purpose)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { data, error } = await service
    .from("invitations")
    .insert({
      purpose,
      role: input.role,
      email,
      full_name: input.fullName?.trim() || null,
      phone: input.phone?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      participant_id: input.participantId ?? null,
      profile_id: input.profileId ?? null,
      permissions: input.permissions ?? [],
      duty: input.duty?.trim() || null,
      station: input.station?.trim() || null,
      token_hash: hashToken(token),
      expires_at: expiresAt,
      invited_by: actor?.userId ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(`Could not create the invitation: ${error?.message ?? "unknown error"}`);

  await service.from("credential_events").insert({
    profile_id: input.profileId ?? null,
    participant_id: input.participantId ?? null,
    event_type: purpose === "reset" ? "password_reset_sent" : "invitation_created",
    actor_id: actor?.userId ?? null,
    note: `${input.role} ${purpose} link for ${email}, expires ${expiresAt}`,
  });
  return { id: data.id, url: `${appUrl()}/invite/${token}`, expiresAt, email, role: input.role, purpose };
}

/** Looks an invitation up by its raw token (never exposed to the client). */
export async function findInvitation(token: string): Promise<Invitation | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { data } = await createServiceClient().from("invitations").select("*").eq("token_hash", hashToken(token)).maybeSingle<Invitation>();
  return data ?? null;
}

export async function revokeInvitation(actor: Session, id: string) {
  const { error } = await createServiceClient(actor.userId)
    .from("invitations")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.userId })
    .eq("id", id)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  await audit(actor, "invitation.revoked", { type: "invitations", id });
}

export type AcceptResult = { ok: true; email: string } | { ok: false; error: string };

/**
 * Accepts an invitation: claims it atomically (single use), then creates the
 * account (activate) or sets the new password (reset). On failure the claim
 * is released so the link can be retried until it expires.
 */
export async function acceptInvitation(token: string, input: { fullName: string; password: string }): Promise<AcceptResult> {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  const { data: claimed } = await service
    .from("invitations")
    .update({ accepted_at: nowIso })
    .eq("token_hash", hashToken(token))
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle<Invitation>();
  if (!claimed) return { ok: false, error: "This link is invalid, expired, revoked or already used. Ask the organisers for a new one." };

  const release = async () => {
    await service.from("invitations").update({ accepted_at: null, accepted_by: null }).eq("id", claimed.id);
  };

  try {
    let userId: string;
    if (claimed.purpose === "reset") {
      userId = claimed.profile_id!;
      const { error } = await service.auth.admin.updateUserById(userId, { password: input.password, ban_duration: "none" });
      if (error) throw new Error(error.message);
      await service.from("profiles").update({ must_change_password: false, temp_password_expires_at: null }).eq("id", userId);
    } else {
      const { data, error } = await service.auth.admin.createUser({
        email: claimed.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.fullName },
        app_metadata: { role: claimed.role, ...(claimed.participant_id ? { participant_id: claimed.participant_id } : {}) },
      });
      if (error || !data.user) {
        const exists = /already|registered|exists/i.test(error?.message ?? "");
        throw new Error(exists ? "An account with this email already exists. Sign in instead, or ask for a password reset link." : error?.message ?? "Account creation failed");
      }
      userId = data.user.id;
      await service
        .from("profiles")
        .update({ full_name: input.fullName, phone: claimed.phone, job_title: claimed.job_title, status: "active", must_change_password: false })
        .eq("id", userId);
      if (claimed.role === "admin" || claimed.role === "official") {
        if (claimed.permissions.length) {
          const rows = claimed.permissions.map((permission) => ({ profile_id: userId, permission, granted_by: claimed.invited_by }));
          const { error: permError } = await service.from("staff_permissions").upsert(rows, { onConflict: "profile_id,permission" });
          if (permError) throw new Error(`Permissions could not be applied: ${permError.message}`);
        }
        if (claimed.role === "official" && (claimed.duty || claimed.station)) {
          await service.from("official_assignments").upsert({ profile_id: userId, duty: claimed.duty, station: claimed.station, updated_by: claimed.invited_by });
        }
      }
    }
    await service.from("invitations").update({ accepted_by: userId }).eq("id", claimed.id);
    await service.from("credential_events").insert({
      profile_id: userId,
      participant_id: claimed.participant_id,
      event_type: claimed.purpose === "reset" ? "password_changed" : "invitation_accepted",
      actor_id: userId,
    });
    return { ok: true, email: claimed.email };
  } catch (e) {
    await release();
    return { ok: false, error: e instanceof Error ? e.message : "Could not complete the invitation." };
  }
}
