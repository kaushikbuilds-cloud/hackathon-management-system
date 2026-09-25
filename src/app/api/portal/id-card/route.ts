import { NextResponse, type NextRequest } from "next/server";
import { contentDisposition } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { loadTeamCardContext, renderTeamPdf } from "@/lib/id-cards";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Team Portal ID cards (only when enabled in Event Setup): any participant can
 * download their own card; the Team Leader can download the whole team PDF.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.profile.role !== "participant" || !session.profile.participant_id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const scope = request.nextUrl.searchParams.get("scope") === "team" ? "team" : "me";
  const supabase = await createClient();
  const [{ data: hackathon }, { data: teamId }, { data: leader }] = await Promise.all([
    supabase.from("hackathons").select("portal_id_cards").limit(1).maybeSingle<{ portal_id_cards: boolean }>(),
    supabase.rpc("my_team_id"),
    supabase.rpc("is_team_leader"),
  ]);
  if (!hackathon?.portal_id_cards) return NextResponse.json({ error: "ID cards are not available yet." }, { status: 403 });
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 404 });
  if (scope === "team" && !leader) return NextResponse.json({ error: "Only the Team Leader can download the team PDF." }, { status: 403 });

  // Ownership is established above; read card data with the service client.
  const ctx = await loadTeamCardContext(createServiceClient(), teamId as string);
  if (!ctx) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (scope === "me") {
    ctx.members = ctx.members.filter((m) => m.id === session.profile.participant_id);
    ctx.validation.errors = ctx.validation.errors.filter((e) => !e.participantCode || e.participantCode === ctx.members[0]?.participant_code);
    if (ctx.validation.errors.some((e) => e.field === "members")) ctx.validation.errors = ctx.validation.errors.filter((e) => e.field !== "members");
  }
  if (ctx.validation.errors.length) return NextResponse.json({ error: "Your card is not ready yet. Contact the organisers." }, { status: 409 });
  const pdf = await renderTeamPdf(ctx);
  const name = scope === "me" ? `${ctx.members[0].participant_code}_ID_Card.pdf` : ctx.fileName;
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": contentDisposition("attachment", name), "Cache-Control": "private, no-store" },
  });
}
