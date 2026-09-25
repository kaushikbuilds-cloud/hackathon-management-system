import { NextResponse } from "next/server";
import { guardApi, UUID_RE } from "@/lib/api";
import { BUCKETS, signedUrl } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/server";
import type { IdCardJob } from "@/lib/types";

export async function GET(_request: Request, ctx: RouteContext<"/api/id-cards/jobs/[jobId]/download">) {
  const guard = await guardApi("generate_pdf");
  if (guard.response) return guard.response;
  const { jobId } = await ctx.params;
  if (!UUID_RE.test(jobId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { data: job } = await createServiceClient().from("id_card_jobs").select("*").eq("id", jobId).eq("hackathon_id", guard.session.hackathonId).maybeSingle<IdCardJob>();
  if (!job?.file_path || job.status !== "completed") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await signedUrl(BUCKETS.idCards, job.file_path, job.file_name ?? undefined);
  if (!url) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(url);
}
