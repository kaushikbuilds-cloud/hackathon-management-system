"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { homePathFor } from "@/lib/auth";
import { checkPasswordStrength } from "@/lib/domain/password";
import { acceptInvitation } from "@/lib/invitations";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type AcceptState = { error?: string; fullName?: string };

export async function acceptInvite(token: string, _prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const fullName = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!z.string().min(2).max(100).safeParse(fullName).success) return { error: "Enter your full name.", fullName };
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak, fullName };
  if (password !== confirm) return { error: "Passwords do not match.", fullName };
  if (!(await rateLimit("login", `invite|${await clientIp()}`))) return { error: "Too many attempts. Please wait a few minutes.", fullName };

  const result = await acceptInvitation(token, { fullName, password });
  if (!result.ok) return { error: result.error, fullName };

  // Sign the new user straight in.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: result.email, password });
  if (error || !data.user) redirect("/login");
  const { data: profile } = await createServiceClient(data.user.id).from("profiles").select("*").eq("id", data.user.id).single<Profile>();
  await audit(profile ? { userId: data.user.id, profile } : null, "auth.invitation_accepted", { type: "profiles", id: data.user.id });
  redirect(homePathFor(profile?.role ?? "participant"));
}
