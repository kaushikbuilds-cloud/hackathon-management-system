import { NextResponse } from "next/server";
import { guardApi, UUID_RE } from "@/lib/api";
import { BUCKETS, signedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { IdCardJob } from "@/lib/types";

/** Redirects to a short-lived signed URL for the team's latest completed PDF. */
export async function GET(_request: Request, ctx: RouteContext<"/api/teams/[id]/id-cards/latest">) {
  const guard = await guardApi("generate_pdf");
  if (guard.response) return guard.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("id_card_jobs").select("*").eq("team_id", id).eq("status", "completed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle<IdCardJob>();
  if (!job?.file_path) return NextResponse.json({ error: "No generated PDF for this team" }, { status: 404 });
  const url = await signedUrl(BUCKETS.idCards, job.file_path, job.file_name ?? undefined);
  if (!url) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(url);
}
