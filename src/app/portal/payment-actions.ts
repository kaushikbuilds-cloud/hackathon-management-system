"use server";

import { revalidatePath } from "next/cache";
import { flash } from "@/lib/actions";
import { requireParticipant } from "@/lib/auth";
import { UTR_RE, normalizeUtr } from "@/lib/domain/fees";
import { BUCKETS, uploadObject, validateUpload } from "@/lib/storage";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Team Leader resubmits payment proof after the organisers rejected it. */
export async function resubmitPayment(formData: FormData) {
  const session = await requireParticipant();
  const supabase = await createClient();
  const [{ data: teamId }, { data: leader }] = await Promise.all([supabase.rpc("my_team_id"), supabase.rpc("is_team_leader")]);
  if (!teamId || !leader) flash("/portal", { error: "Only the Team Leader can submit the payment." });
  const service = createServiceClient(session.userId);
  const { data: team } = await service.from("teams").select("id, hackathon_id, payment_status").eq("id", teamId as string).single<{ id: string; hackathon_id: string; payment_status: string }>();
  if (!team || team.payment_status !== "rejected") flash("/portal", { error: "There is no payment to resubmit." });

  const utr = normalizeUtr(String(formData.get("payment_utr") ?? "")).slice(0, 40);
  if (!UTR_RE.test(utr)) flash("/portal", { error: "Enter the UPI transaction ID (6–35 letters or digits)." });
  const file = formData.get("payment_proof");
  if (!(file instanceof File) || file.size === 0) flash("/portal", { error: "Upload a screenshot of the payment." });
  const proof = await validateUpload(file, ["image/png", "image/jpeg", "application/pdf"], 5 * 1024 * 1024);
  if (!proof.ok) flash("/portal", { error: proof.error });
  const { data: used } = await service.from("teams").select("id").eq("hackathon_id", team.hackathon_id).ilike("payment_utr", utr).neq("id", team.id).limit(1);
  if (used?.length) flash("/portal", { error: "This transaction ID was already used for another team." });

  const path = `${team.hackathon_id}/${team.id}/proof-${Date.now()}.${proof.extension}`;
  await uploadObject(BUCKETS.paymentProofs, path, proof.bytes, proof.contentType);
  const { error } = await service.from("teams").update({
    payment_status: "submitted", payment_utr: utr, payment_proof_path: path, payment_submitted_at: new Date().toISOString(),
    payment_note: null, payment_verified_by: null, payment_verified_at: null,
  }).eq("id", team.id).eq("payment_status", "rejected");
  if (error) flash("/portal", { error: "Could not save the payment. Please try again." });
  revalidatePath("/portal");
  flash("/portal", { notice: "Payment proof submitted. The organisers will verify it." });
}
