"use server";

import { randomUUID } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createInvitation } from "@/lib/invitations";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildRegistrationSchema, flattenIssues, registrationDraftFromFormData, type RegistrationDraft,
} from "@/lib/domain/registration";
import type { RegistrationForm } from "@/lib/types";

export type RegisterState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: RegistrationDraft;
  result?: { team_code: string; team_name: string; participant_codes: string[]; activation_url?: string };
  /** Changes on every response so the client form remounts with the submitted values. */
  nonce?: string;
};

type RpcResult =
  | { ok: true; team_id: string; team_code: string; team_name: string; participant_codes: string[]; replayed: boolean }
  | { ok: false; code: string; message: string; field?: string };

export async function registerTeam(slug: string, _prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const values = registrationDraftFromFormData(formData);
  const idempotencyKey = String(formData.get("idempotency_key") ?? "");

  if (!(await rateLimit("registration", await clientIp()))) {
    return { nonce: randomUUID(), status: "error", values, message: "Too many registration attempts from your network. Please try again later." };
  }

  const supabase = await createClient();
  const { data: form } = await supabase
    .from("registration_forms")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<RegistrationForm>();
  if (!form) return { nonce: randomUUID(), status: "error", values, message: "This registration form is not accepting submissions." };

  const parsed = buildRegistrationSchema(form).safeParse(values);
  if (!parsed.success) {
    const fieldErrors = flattenIssues(parsed.error);
    await createServiceClient().from("registration_submissions").insert({
      form_id: form.id,
      status: "rejected",
      payload: { team_name: values.team_name.slice(0, 100), member_count: values.members.length },
      errors: { code: "validation", fields: Object.keys(fieldErrors) },
    });
    return { nonce: randomUUID(), status: "error", values, fieldErrors, message: "Please fix the highlighted fields." };
  }

  const payload = parsed.data;
  const service = createServiceClient();
  const { data, error } = await service.rpc("register_team", {
    p_form_slug: slug,
    p_payload: payload,
    p_idempotency_key: /^[A-Za-z0-9-]{8,100}$/.test(idempotencyKey) ? idempotencyKey : null,
  });
  if (error || !data) {
    console.error("register_team failed", error?.message);
    return { nonce: randomUUID(), status: "error", values, message: "We could not save your registration. Please try again in a moment." };
  }
  const result = data as RpcResult;
  if (!result.ok) {
    const fieldErrors: Record<string, string> = {};
    if (result.field) fieldErrors[result.field] = result.message;
    return { nonce: randomUUID(), status: "error", values, fieldErrors, message: result.message };
  }

  // The submitter is the Team Leader: give them a single-use activation link.
  // Other members receive theirs from the organisers.
  let activationUrl: string | undefined;
  if (!result.replayed) {
    const { data: leader } = await service.from("participants").select("id, email, full_name").eq("team_id", result.team_id).eq("role", "leader").single<{ id: string; email: string; full_name: string }>();
    if (leader) {
      activationUrl = (await createInvitation(null, { role: "participant", email: leader.email, participantId: leader.id, fullName: leader.full_name })).url;
    }
  }

  return {
    status: "success",
    result: { team_code: result.team_code, team_name: result.team_name, participant_codes: result.participant_codes, activation_url: activationUrl },
  };
}

