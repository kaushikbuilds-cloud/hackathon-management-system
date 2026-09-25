import { NextResponse } from "next/server";
import { guardApi, UUID_RE } from "@/lib/api";
import { BUCKETS, signedUrl } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/server";

/** Redirects to a short-lived signed URL for a team's payment screenshot (registration managers only). */
export async function GET(_request: Request, ctx: RouteContext<"/api/teams/[id]/payment-proof">) {
  const guard = await guardApi("manage_registrations");
  if (guard.response) return guard.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  const { data: team } = await createServiceClient()
    .from("teams").select("payment_proof_path").eq("id", id).eq("hackathon_id", guard.session.hackathonId).maybeSingle<{ payment_proof_path: string | null }>();
  if (!team?.payment_proof_path) return NextResponse.json({ error: "No payment proof for this team" }, { status: 404 });
  const url = await signedUrl(BUCKETS.paymentProofs, team.payment_proof_path);
  if (!url) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(url);
}
