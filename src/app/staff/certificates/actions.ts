"use server";

import { revalidatePath } from "next/cache";
import { UUID, bool, dbErrorMessage, flash, str } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { SIGNATURE_BUCKET, removeSignature, uploadObject, validateUpload } from "@/lib/storage";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const PATH = "/staff/certificates";

/** Signatories, signature images and an optional line printed on every certificate. */
export async function saveCertificateSettings(formData: FormData) {
  const session = await requirePermission("manage_event");
  const update: Record<string, string | null> = {
    cert_signatory1_name: str(formData, "sig1_name", 80) || null, cert_signatory1_title: str(formData, "sig1_title", 80) || null,
    cert_signatory2_name: str(formData, "sig2_name", 80) || null, cert_signatory2_title: str(formData, "sig2_title", 80) || null,
    cert_note: str(formData, "note", 200) || null,
  };
  const { data: current } = await createServiceClient().from("hackathons").select("cert_signature1_path, cert_signature2_path").eq("id", session.hackathonId)
    .single<{ cert_signature1_path: string | null; cert_signature2_path: string | null }>();
  const replaced: string[] = [];
  for (const n of [1, 2] as const) {
    const old = current?.[`cert_signature${n}_path`] ?? null;
    if (bool(formData, `remove_sig${n}`)) { update[`cert_signature${n}_path`] = null; if (old) replaced.push(old); }
    const file = formData.get(`sig${n}_image`);
    if (file instanceof File && file.size > 0) {
      const check = await validateUpload(file, ["image/png", "image/jpeg"], 2 * 1024 * 1024);
      if (!check.ok) flash(PATH, { error: `Signature ${n}: ${check.error}` });
      // Private: only the server reads signatures, to draw certificates.
      const path = `${session.hackathonId}/signatures/signature-${n}-${Date.now()}.${check.extension}`;
      await uploadObject(SIGNATURE_BUCKET, path, check.bytes, check.contentType);
      update[`cert_signature${n}_path`] = path;
      if (old) replaced.push(old);
    }
  }
  const { error } = await (await createClient()).from("hackathons").update(update).eq("id", session.hackathonId);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  await Promise.all(replaced.map(removeSignature));
  revalidatePath(PATH);
  flash(PATH, { notice: "Certificate details saved. Preview one to check it." });
}

/** An award (Winner, Best UI, ...) turns the team's certificates into certificates of achievement. */
export async function setTeamAward(teamId: string, formData: FormData) {
  const session = await requirePermission("manage_event");
  if (!UUID.test(teamId)) flash(PATH, { error: "Invalid team." });
  const award = str(formData, "award", 60).replace(/\s+/g, " ") || null;
  const { error } = await createServiceClient(session.userId).from("teams").update({ award }).eq("id", teamId).eq("hackathon_id", session.hackathonId);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  revalidatePath(PATH);
  flash(PATH, { notice: award ? `Award saved: ${award}.` : "Award removed; the team gets participation certificates." });
}
