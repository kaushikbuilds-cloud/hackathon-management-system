"use server";

import { randomUUID } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { UTR_RE, feeFor, normalizeUtr } from "@/lib/domain/fees";
import { BUCKETS, uploadObject, validateUpload, type UploadCheck } from "@/lib/storage";
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
  /** Re-shown after a validation error (the screenshot must be chosen again). */
  utr?: string;
  result?: {
    team_code: string;
    team_name: string;
    payment?: { amount: number; stored: boolean };
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

  // Registration fee: UTR + screenshot are required and checked before anything is saved.
  const utr = normalizeUtr(String(formData.get("payment_utr") ?? "")).slice(0, 40);
  let proof: Extract<UploadCheck, { ok: true }> | null = null;
  const feeRequired = form.fee_enabled && form.fee_amount && form.fee_upi_id;
  if (feeRequired) {
    const fieldErrors: Record<string, string> = {};
    if (!UTR_RE.test(utr)) fieldErrors.payment_utr = "Enter the UPI transaction ID (6–35 letters or digits).";
    const file = formData.get("payment_proof");
    if (!(file instanceof File) || file.size === 0) fieldErrors.payment_proof = "Upload a screenshot of the payment.";
    else {
      const check = await validateUpload(file, ["image/png", "image/jpeg", "application/pdf"], 5 * 1024 * 1024);
      if (!check.ok) fieldErrors.payment_proof = check.error;
      else proof = check;
    }
    if (!fieldErrors.payment_utr) {
      const { data: used } = await service.from("teams").select("id").eq("hackathon_id", form.hackathon_id).ilike("payment_utr", utr).limit(1);
      if (used?.length) fieldErrors.payment_utr = "This transaction ID was already used for another team.";
    }
    if (Object.keys(fieldErrors).length) {
      return {
        nonce: randomUUID(), status: "error", values, utr, fieldErrors,
        message: "Please check the payment details." + (fieldErrors.payment_proof ? "" : " Choose the screenshot again before resubmitting."),
      };
    }
  }

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

  let payment: { amount: number; stored: boolean } | undefined;
  if (feeRequired && proof && !result.replayed) {
    const amount = feeFor({ amount: Number(form.fee_amount), basis: form.fee_basis }, payload.members.length);
    const path = `${form.hackathon_id}/${result.team_id}/proof-${Date.now()}.${proof.extension}`;
    let stored = false;
    try {
      await uploadObject(BUCKETS.paymentProofs, path, proof.bytes, proof.contentType);
      const { error: payError } = await service.from("teams").update({
        payment_status: "submitted", payment_amount: amount, payment_utr: utr, payment_proof_path: path, payment_submitted_at: new Date().toISOString(),
      }).eq("id", result.team_id);
      stored = !payError;
      if (payError) console.error("payment save failed", payError.message);
    } catch (e) {
      console.error("payment proof upload failed", e instanceof Error ? e.message : e);
    }
    payment = { amount, stored };
  }

  return {
    status: "success",
    result: { team_code: result.team_code, team_name: result.team_name, payment },
  };
}

/** Last 10 digits, so "+91 98765 43210" and "9876543210" count as the same number. Mirrors participants.phone_key. */
function phoneKey(phone: string | undefined | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-10) : null;
}
