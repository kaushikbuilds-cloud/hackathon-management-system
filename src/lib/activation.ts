import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { recordCredentialEvent } from "@/lib/accounts";
import { PARTICIPANT_CODE_PATTERN, TEAM_CODE_PATTERN, normalizeIdInput } from "@/lib/domain/ids";
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

export type TeamLogin = { activated: boolean; code: string | null };

/**
 * The team's shared portal login, for printing on its ID cards: whether the
 * team account exists, and the one-time code still waiting to be used (created
 * here the first time, then reused so reprints show the same code). Callers
 * must already have checked the right to print cards.
 */
export async function teamLoginInfo(teamId: string): Promise<TeamLogin> {
  const service = createServiceClient();
  const [{ data: account }, { data: row }] = await Promise.all([
    service.from("profiles").select("id").eq("team_id", teamId).maybeSingle(),
    service.from("team_activation_codes").select("code, used_at").eq("team_id", teamId).maybeSingle<{ code: string; used_at: string | null }>(),
  ]);
  if (row && !row.used_at) return { activated: Boolean(account), code: row.code };
  if (account) return { activated: true, code: null };
  const { data: saved } = await service
    .from("team_activation_codes")
    .upsert({ team_id: teamId, code: generateActivationCode(), used_at: null, created_at: new Date().toISOString() }, { onConflict: "team_id" })
    .select("code").single<{ code: string }>();
  return { activated: false, code: saved?.code ?? null };
}

/** Staff: a fresh code for a team that lost its password. Reprinted cards carry it. */
export async function reissueTeamCode(teamId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from("team_activation_codes")
    .upsert({ team_id: teamId, code: generateActivationCode(), used_at: null, created_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) throw new Error("Could not create a new team code.");
}

/** The sign-in address behind a team account (never shown or mailed). */
export function teamLoginEmail(teamId: string): string {
  return `team-${teamId}@teams.hackathonbase.app`;
}

export type RedeemResult = { ok: true; email: string } | { ok: false; error: string };

const GENERIC = "That Team ID and activation code do not match. Check both on your ID card.";

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Team ID + card code → the team's shared portal login (created the first
 * time, password reset when staff issued a new code). The code is claimed
 * atomically (single use) and released again if anything fails.
 */
export async function redeemTeamCode(input: { teamCode: string; code: string; password: string }): Promise<RedeemResult> {
  const service = createServiceClient();
  const teamCode = normalizeIdInput(input.teamCode);
  const code = normalizeActivationCode(input.code);
  if (!TEAM_CODE_PATTERN.test(teamCode) || !ACTIVATION_CODE_RE.test(code)) return { ok: false, error: GENERIC };

  const { data: team } = await service.from("teams").select("id, name").eq("team_code", teamCode).maybeSingle<{ id: string; name: string }>();
  if (!team) return { ok: false, error: GENERIC };
  const { data: row } = await service.from("team_activation_codes").select("code, used_at").eq("team_id", team.id).maybeSingle<{ code: string; used_at: string | null }>();
  const { data: account } = await service.from("profiles").select("id, email").eq("team_id", team.id).maybeSingle<{ id: string; email: string }>();
  if (row?.used_at && account && sameCode(row.code, code)) {
    return { ok: false, error: "Your team has already activated its login. Sign in with your Team ID and the team password, or ask the organisers for a new code." };
  }
  if (!row || row.used_at || !sameCode(row.code, code)) return { ok: false, error: GENERIC };

  const { data: claimed } = await service
    .from("team_activation_codes").update({ used_at: new Date().toISOString() })
    .eq("team_id", team.id).is("used_at", null).select("team_id").maybeSingle();
  if (!claimed) return { ok: false, error: GENERIC };

  try {
    if (account) {
      const { error } = await service.auth.admin.updateUserById(account.id, { password: input.password });
      if (error) throw new Error("Could not set the new password. Please try again.");
      await service.from("profiles").update({ status: "active", must_change_password: false }).eq("id", account.id);
      await recordCredentialEvent(null, "activation_code_used", { profileId: account.id }, "Team password reset with a new ID card code");
      return { ok: true, email: account.email };
    }
    const email = teamLoginEmail(team.id);
    const { data: created, error } = await service.auth.admin.createUser({
      email, password: input.password, email_confirm: true,
      app_metadata: { role: "participant" }, user_metadata: { full_name: team.name },
    });
    if (error || !created.user) throw new Error("Activation failed. Please try again.");
    const { error: linkError } = await service.from("profiles").update({ team_id: team.id, full_name: team.name }).eq("id", created.user.id);
    if (linkError) {
      await service.auth.admin.deleteUser(created.user.id);
      throw new Error("Activation failed. Please try again.");
    }
    await recordCredentialEvent(null, "activation_code_used", { profileId: created.user.id }, "Team login activated with ID card code");
    return { ok: true, email };
  } catch (e) {
    await service.from("team_activation_codes").update({ used_at: null }).eq("team_id", team.id);
    return { ok: false, error: e instanceof Error ? e.message : "Activation failed. Please try again." };
  }
}

/** Resolves a Team ID typed into the sign-in box to the team account's sign-in address. */
export async function emailForTeamCode(value: string): Promise<string | null> {
  const teamCode = normalizeIdInput(value);
  if (!TEAM_CODE_PATTERN.test(teamCode)) return null;
  const service = createServiceClient();
  const { data: team } = await service.from("teams").select("id").eq("team_code", teamCode).maybeSingle<{ id: string }>();
  if (!team) return null;
  const { data: account } = await service.from("profiles").select("email").eq("team_id", team.id).maybeSingle<{ email: string }>();
  return account?.email ?? null;
}

/** Older per-member accounts: a Participant ID typed into the sign-in box → that participant's email. */
export async function emailForParticipantCode(value: string): Promise<string | null> {
  const participantCode = normalizeIdInput(value);
  if (!PARTICIPANT_CODE_PATTERN.test(participantCode)) return null;
  const service = createServiceClient();
  const { data } = await service.from("participants").select("id").eq("participant_code", participantCode).maybeSingle<{ id: string }>();
  if (!data) return null;
  const { data: account } = await service.from("profiles").select("email").eq("participant_id", data.id).maybeSingle<{ email: string }>();
  return account?.email ?? null;
}
