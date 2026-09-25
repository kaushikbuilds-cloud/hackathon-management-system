"use server";

import { randomUUID } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { activationInfoFor } from "@/lib/activation";
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
  result?: {
    team_code: string;
    team_name: string;
    participant_codes: string[];
    /** Portal login details for every member: Participant ID + one-time activation code. */
    logins: { full_name: string; participant_code: string; role: "leader" | "member"; activation_code: string | null }[];
  };
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

  // Phone numbers must be unique across all teams (the database enforces it too).
  const phoneKeys = payload.members.map((m) => phoneKey(m.phone)).filter((k): k is string => Boolean(k));
  if (phoneKeys.length) {
    const { data: taken } = await service.from("participants").select("phone_key").in("phone_key", phoneKeys).limit(1);
    if (taken?.length) {
      const i = payload.members.findIndex((m) => phoneKey(m.phone) === taken[0].phone_key);
      return {
        nonce: randomUUID(), status: "error", values,
        fieldErrors: { [`members.${i}.phone`]: "This phone number is already registered in another team." },
        message: "One of the member phone numbers is already registered in another team.",
      };
    }
  }

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

  // Every member gets portal login details straight away: their Participant ID
  // and a one-time activation code (the same code is printed on the ID card).
  const { data: members } = await service
    .from("participants").select("id, full_name, participant_code, role").eq("team_id", result.team_id)
    .order("role").order("participant_code")
    .returns<{ id: string; full_name: string; participant_code: string; role: "leader" | "member" }[]>();
  const info = await activationInfoFor((members ?? []).map((m) => m.id));
  const logins = (members ?? []).map((m) => ({
    full_name: m.full_name, participant_code: m.participant_code, role: m.role, activation_code: info.get(m.id)?.code ?? null,
  }));

  return {
    status: "success",
    result: { team_code: result.team_code, team_name: result.team_name, participant_codes: result.participant_codes, logins },
  };
}

/** Last 10 digits, so "+91 98765 43210" and "9876543210" count as the same number. Mirrors participants.phone_key. */
function phoneKey(phone: string | undefined | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-10) : null;
}
