import { NextResponse } from "next/server";
import { UUID } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { BUCKETS, signedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * A team's slides PDF. Row-level security decides who may see the project
 * (the team itself, or staff and judges of the hackathon); the file is then
 * handed out through a short-lived signed link.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[teamId]/slides">) {
  const { teamId } = await ctx.params;
  if (!UUID.test(teamId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getSession())) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data } = await (await createClient()).from("project_submissions").select("slides_path, title").eq("team_id", teamId).maybeSingle<{ slides_path: string | null; title: string }>();
  if (!data?.slides_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await signedUrl(BUCKETS.projectFiles, data.slides_path, `${data.title.replace(/[^\w.-]+/g, "_").slice(0, 60)}_slides.pdf`);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
