"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { redeemTeamCode } from "@/lib/activation";
import { normalizeIdInput, participantIdInsteadOfTeamId } from "@/lib/domain/ids";
import { checkPasswordStrength } from "@/lib/domain/password";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type ActivateState = { error?: string; teamCode?: string };

export async function activateAccount(_prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const teamCode = normalizeIdInput(String(formData.get("team_code") ?? "").slice(0, 40)).slice(0, 30);
  const code = String(formData.get("code") ?? "").slice(0, 30);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!teamCode || !code) return { error: "Enter your Team ID and activation code from your ID card.", teamCode };
  const wrongId = participantIdInsteadOfTeamId(teamCode);
  if (wrongId) return { error: wrongId, teamCode };
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak, teamCode };
  if (password !== confirm) return { error: "Passwords do not match.", teamCode };

  // Limit guesses per team and per network.
  const ip = await clientIp();
  const allowed = (await rateLimit("activation", `team|${teamCode}`)) && (await rateLimit("activation", `ip|${ip}`));
  if (!allowed) return { error: "Too many attempts. Please wait 15 minutes and try again, or ask the help desk.", teamCode };

  const result = await redeemTeamCode({ teamCode, code, password });
  if (!result.ok) {
    await audit(null, "auth.activation_failed", { type: "auth" }, { team_code: teamCode });
    return { error: result.error, teamCode };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: result.email, password });
  if (error || !data.user) redirect("/login");
  const { data: profile } = await createServiceClient(data.user.id).from("profiles").select("*").eq("id", data.user.id).single<Profile>();
  await audit(profile ? { userId: data.user.id, profile } : null, "auth.activated_with_code", { type: "profiles", id: data.user.id });
  redirect("/portal");
}
