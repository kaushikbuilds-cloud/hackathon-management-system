"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { checkPasswordStrength } from "@/lib/domain/password";
import { settings } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type SetupState = { error?: string };

export async function superAdminExists(): Promise<boolean> {
  const { count } = await createServiceClient().from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  return (count ?? 0) > 0;
}

function tokenMatches(given: string): boolean {
  const expected = settings.setupToken;
  if (expected.length < 16 || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * One-time Super Admin provisioning. Works only while no Super Admin exists
 * and only with the SETUP_TOKEN configured on the server.
 */
export async function createFirstSuperAdmin(_prev: SetupState, formData: FormData): Promise<SetupState> {
  if (!(await rateLimit("login", `setup|${await clientIp()}`))) return { error: "Too many attempts. Please wait." };
  if (await superAdminExists()) return { error: "Setup is already complete." };
  if (!tokenMatches(String(formData.get("token") ?? ""))) return { error: "Invalid setup token." };
  const parsed = z.object({
    full_name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
  }).safeParse({ full_name: formData.get("full_name"), email: formData.get("email") });
  if (!parsed.success) return { error: "Enter your name and a valid email." };
  const password = String(formData.get("password") ?? "");
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak };

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email: parsed.data.email, password, email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name }, app_metadata: { role: "super_admin" },
  });
  if (error || !data.user) return { error: `Could not create the account: ${error?.message ?? "unknown error"}` };
  await service.from("profiles").update({ full_name: parsed.data.full_name, role: "super_admin", status: "active" }).eq("id", data.user.id);
  await audit(null, "setup.super_admin_created", { type: "profiles", id: data.user.id }, { email: parsed.data.email });

  await (await createClient()).auth.signInWithPassword({ email: parsed.data.email, password });
  redirect("/staff");
}
