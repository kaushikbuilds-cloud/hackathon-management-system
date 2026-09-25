"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { homePathFor, getSession } from "@/lib/auth";
import { recordCredentialEvent } from "@/lib/accounts";
import { emailForParticipantCode } from "@/lib/activation";
import { teamIdInsteadOfParticipantId } from "@/lib/domain/ids";
import { checkPasswordStrength } from "@/lib/domain/password";
import { appUrl } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, hashKey } from "@/lib/request";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type AuthState = { error?: string; message?: string; email?: string };

/** Only allow same-site relative redirects. */
function safeNext(value: FormDataEntryValue | null): string | null {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  // Participants may sign in with the Participant ID printed on their card.
  const teamId = email.includes("@") ? null : teamIdInsteadOfParticipantId(email);
  if (teamId) return { error: teamId, email };
  const loginEmail = email.includes("@") ? email : (await emailForParticipantCode(email)) ?? email;
  const parsed = loginSchema.safeParse({ email: loginEmail, password: formData.get("password") });
  if (!parsed.success) {
    return { error: email.includes("@") ? "Enter a valid email and password." : "Invalid Participant ID or password.", email };
  }

  const ip = await clientIp();
  if (!(await rateLimit("login", `${ip}|${parsed.data.email}`))) {
    return { error: "Too many sign-in attempts. Please wait a few minutes and try again.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    await audit(null, "auth.sign_in_failed", { type: "auth" }, { email_hash: hashKey(parsed.data.email), reason: error?.code ?? "unknown" });
    return { error: email.includes("@") ? "Invalid email or password." : "Invalid Participant ID or password.", email };
  }

  const service = createServiceClient(data.user.id);
  const { data: profile } = await service.from("profiles").select("*").eq("id", data.user.id).maybeSingle<Profile>();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account is deactivated. Contact the organisers.", email };
  }
  if (profile.must_change_password && profile.temp_password_expires_at && new Date(profile.temp_password_expires_at) < new Date()) {
    await supabase.auth.signOut();
    return { error: "Your temporary password has expired. Ask the organisers to issue a new one.", email };
  }
  if (profile.role === "participant" && !profile.participant_id) {
    await supabase.auth.signOut();
    return { error: "This account is not linked to a team yet. Contact the organisers.", email };
  }

  await service.from("profiles").update({ last_sign_in_at: new Date().toISOString() }).eq("id", profile.id);
  await audit({ userId: profile.id, profile }, "auth.sign_in", { type: "profiles", id: profile.id });

  if (profile.must_change_password) redirect("/change-password");
  redirect(safeNext(formData.get("next")) ?? homePathFor(profile.role));
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const ip = await clientIp();
  const generic = { message: "If an account exists for that address, a reset link has been sent. Check your inbox." };
  if (!(await rateLimit("passwordReset", `${ip}|${email.data}`))) return generic;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${appUrl()}/auth/callback?next=/change-password` });
  if (error) console.error("reset email failed", error.message);
  await audit(null, "auth.password_reset_requested", { type: "auth" }, { email_hash: hashKey(email.data) });
  return generic;
}

export async function changePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const session = await getSession();
  if (!session) redirect("/login");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak };
  if (password !== confirm) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message.includes("different") ? "Choose a password different from the current one." : `Could not update password: ${error.message}` };
  }
  await createServiceClient(session.userId)
    .from("profiles")
    .update({ must_change_password: false, temp_password_expires_at: null })
    .eq("id", session.userId);
  await recordCredentialEvent(session, "password_changed", { profileId: session.userId, participantId: session.profile.participant_id });
  redirect(homePathFor(session.profile.role));
}
