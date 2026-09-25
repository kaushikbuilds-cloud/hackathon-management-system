import { NextResponse } from "next/server";
import { guardApi, UUID_RE } from "@/lib/api";
import { generateAndStoreTeamPdf, loadTeamCardContext } from "@/lib/id-cards";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Generate & store the team's ID card PDF. Returns a short-lived download URL. */
export async function POST(_request: Request, ctx: RouteContext<"/api/teams/[id]/id-cards">) {
  const guard = await guardApi("generate_pdf");
  if (guard.response) return guard.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid team id" }, { status: 400 });

  const supabase = createServiceClient();
  const context = await loadTeamCardContext(supabase, id);
  if (!context) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (context.validation.errors.length) {
    return NextResponse.json({ error: "Validation failed", issues: context.validation.errors }, { status: 422 });
  }
  const result = await generateAndStoreTeamPdf(guard.session, context);
  if (!result.ok) return NextResponse.json({ error: result.error, jobId: result.job?.id ?? null }, { status: 500 });
  return NextResponse.json({
    ok: true,
    jobId: result.job.id,
    fileName: result.job.file_name,
    pageCount: result.job.page_count,
    downloadUrl: result.downloadUrl ?? `/api/id-cards/jobs/${result.job.id}/download`,
  });
}
