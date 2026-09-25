import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { recordCredentialEvent } from "@/lib/accounts";
import { PARTICIPANT_CODE_PATTERN } from "@/lib/domain/ids";
import { acceptInvitation, createInvitation } from "@/lib/invitations";
import { createServiceClient } from "@/lib/supabase/server";

/** No 0/O, 1/I/L: easy to read off a printed card. Matches the DB check. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ACTIVATION_CODE_RE = /^[A-HJ-KM-NP-Z2-9]{8}$/;

export function generateActivationCode(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** Accepts "x7k9-m2q4", " X7K9 M2Q4 " etc. */
export function normalizeActivationCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export type ActivationInfo = { activated: boolean; code: string | null };

/**
 * For each participant: whether they already have a portal account, and if
 * not, their one-time activation code (created on first use, then reused so
 * reprinted cards keep the same code). Callers must already have checked the
 * right to print cards.
 */
export async function activationInfoFor(participantIds: string[]): Promise<Map<string, ActivationInfo>> {
  const result = new Map<string, ActivationInfo>();
  if (!participantIds.length) return result;
  const service = createServiceClient();
  const [{ data: profiles }, { data: codes }] = await Promise.all([
    service.from("profiles").select("participant_id").in("participant_id", participantIds),
    service.from("participant_activation_codes").select("participant_id, code, used_at").in("participant_id", participantIds),
  ]);
  const activated = new Set((profiles ?? []).map((p) => p.participant_id as string));
  const byId = new Map((codes ?? []).map((c) => [c.participant_id as string, c as { code: string; used_at: string | null }]));

  const missing = participantIds.filter((id) => !activated.has(id) && (!byId.has(id) || byId.get(id)!.used_at));
  if (missing.length) {
    // A used code without an account (account later deleted) is replaced.
    const rows = missing.map((participant_id) => ({ participant_id, code: generateActivationCode(), used_at: null }));
    const { data: saved } = await service
      .from("participant_activation_codes")
      .upsert(rows, { onConflict: "participant_id" })
      .select("participant_id, code, used_at");
    for (const c of saved ?? []) byId.set(c.participant_id as string, c as { code: string; used_at: string | null });
  }
  for (const id of participantIds) {
    result.set(id, activated.has(id) ? { activated: true, code: null } : { activated: false, code: byId.get(id)?.code ?? null });
  }
  return result;
}

export type RedeemResult = { ok: true; email: string } | { ok: false; error: string };

const GENERIC = "That Participant ID and activation code do not match. Check both on your ID card.";

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Participant ID + card code → portal account. The code is claimed
 * atomically (single use) and released again if account creation fails.
 */
export async function redeemActivationCode(input: { participantCode: string; code: string; password: string }): Promise<RedeemResult> {
  const service = createServiceClient();
  const participantCode = input.participantCode.trim().toUpperCase();
  const code = normalizeActivationCode(input.code);
  if (!ACTIVATION_CODE_RE.test(code)) return { ok: false, error: GENERIC };

  const { data: participant } = await service
    .from("participants").select("id, email, full_name").eq("participant_code", participantCode).maybeSingle<{ id: string; email: string; full_name: string }>();
  if (!participant) return { ok: false, error: GENERIC };

  const { data: existing } = await service.from("profiles").select("id").eq("participant_id", participant.id).maybeSingle();
  if (existing) return { ok: false, error: "This participant already has an account. Sign in with your email or Participant ID and your password." };

  const { data: row } = await service
    .from("participant_activation_codes").select("code, used_at").eq("participant_id", participant.id).maybeSingle<{ code: string; used_at: string | null }>();
  if (!row || row.used_at || !sameCode(row.code, code)) return { ok: false, error: GENERIC };

  const { data: claimed } = await service
    .from("participant_activation_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("participant_id", participant.id)
    .is("used_at", null)
    .select("participant_id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: GENERIC };

  try {
    const invite = await createInvitation(null, { role: "participant", email: participant.email, fullName: participant.full_name, participantId: participant.id });
    const token = invite.url.split("/invite/")[1];
    const accepted = await acceptInvitation(token, { fullName: participant.full_name, password: input.password });
    if (!accepted.ok) throw new Error(accepted.error);
    await recordCredentialEvent(null, "activation_code_used", { participantId: participant.id }, "Account activated with ID card code");
    return { ok: true, email: accepted.email };
  } catch (e) {
    await service.from("participant_activation_codes").update({ used_at: null }).eq("participant_id", participant.id);
    return { ok: false, error: e instanceof Error ? e.message : "Activation failed. Please try again." };
  }
}

/** Resolves a Participant ID typed into the sign-in box to that participant's email. */
export async function emailForParticipantCode(value: string): Promise<string | null> {
  const participantCode = value.trim().toUpperCase();
  if (!PARTICIPANT_CODE_PATTERN.test(participantCode)) return null;
  const { data } = await createServiceClient()
    .from("participants").select("email").eq("participant_code", participantCode).maybeSingle<{ email: string }>();
  return data?.email ?? null;
}
