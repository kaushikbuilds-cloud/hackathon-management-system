import { NextResponse } from "next/server";
import { UUID } from "@/lib/actions";
import { BUCKETS, signedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/** A problem statement's PDF: anyone for published statements (row-level security decides), via a short-lived link. */
export async function GET(_request: Request, ctx: RouteContext<"/api/problem-statements/[id]/file">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await (await createClient()).from("problem_statements").select("code, attachment_path").eq("id", id).maybeSingle<{ code: string; attachment_path: string | null }>();
  if (!data?.attachment_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await signedUrl(BUCKETS.projectFiles, data.attachment_path, `${data.code}_problem_statement.pdf`);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
