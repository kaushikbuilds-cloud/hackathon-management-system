"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { redeemActivationCode } from "@/lib/activation";
import { checkPasswordStrength } from "@/lib/domain/password";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type ActivateState = { error?: string; participantCode?: string };

export async function activateAccount(_prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const participantCode = String(formData.get("participant_code") ?? "").trim().toUpperCase().slice(0, 30);
  const code = String(formData.get("code") ?? "").slice(0, 30);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!participantCode || !code) return { error: "Enter your Participant ID and activation code from your ID card.", participantCode };
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak, participantCode };
  if (password !== confirm) return { error: "Passwords do not match.", participantCode };

  // Limit guesses per participant and per network.
  const ip = await clientIp();
  const allowed = (await rateLimit("activation", `pid|${participantCode}`)) && (await rateLimit("activation", `ip|${ip}`));
  if (!allowed) return { error: "Too many attempts. Please wait 15 minutes and try again, or ask the help desk.", participantCode };

  const result = await redeemActivationCode({ participantCode, code, password });
  if (!result.ok) {
    await audit(null, "auth.activation_failed", { type: "auth" }, { participant_code: participantCode });
    return { error: result.error, participantCode };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: result.email, password });
  if (error || !data.user) redirect("/login");
  const { data: profile } = await createServiceClient(data.user.id).from("profiles").select("*").eq("id", data.user.id).single<Profile>();
  await audit(profile ? { userId: data.user.id, profile } : null, "auth.activated_with_code", { type: "profiles", id: data.user.id });
  redirect("/portal");
}
