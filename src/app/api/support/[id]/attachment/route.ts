import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { BUCKETS, signedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/** Visibility is checked through RLS (team members, assignee, or support managers) before signing. */
export async function GET(_request: Request, ctx: RouteContext<"/api/support/[id]/attachment">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { data } = await (await createClient()).from("support_requests").select("attachment_path").eq("id", id).maybeSingle<{ attachment_path: string | null }>();
  if (!data?.attachment_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await signedUrl(BUCKETS.attachments, data.attachment_path, data.attachment_path.split("/").pop());
  return url ? NextResponse.redirect(url) : NextResponse.json({ error: "Unavailable" }, { status: 404 });
}
