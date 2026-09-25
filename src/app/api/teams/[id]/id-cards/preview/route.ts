import { NextResponse } from "next/server";
import { contentDisposition, guardApi, UUID_RE } from "@/lib/api";
import { loadTeamCardContext, renderTeamPdf } from "@/lib/id-cards";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Renders the team's PDF in memory for preview. Nothing is stored. */
export async function GET(_request: Request, ctx: RouteContext<"/api/teams/[id]/id-cards/preview">) {
  const guard = await guardApi("generate_pdf");
  if (guard.response) return guard.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  const context = await loadTeamCardContext(createServiceClient(), id);
  if (!context) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (context.validation.errors.length) return NextResponse.json({ error: "Validation failed", issues: context.validation.errors }, { status: 422 });
  try {
    const pdf = await renderTeamPdf(context);
    return new NextResponse(Buffer.from(pdf.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition("inline", `PREVIEW_${context.fileName}`),
        "Cache-Control": "private, no-store",
        "X-Page-Count": String(pdf.pageCount),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Preview failed" }, { status: 500 });
  }
}
