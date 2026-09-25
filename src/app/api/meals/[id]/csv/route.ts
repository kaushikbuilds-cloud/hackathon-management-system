import { NextResponse } from "next/server";
import { contentDisposition, guardApi } from "@/lib/api";
import { UUID } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/domain/csv";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type Row = { full_name: string; participant_code: string; teams: { name: string; team_code: string; status: string } | null; meal_servings: { served_at: string; method: string }[] };

/** Everyone eligible for a meal, served or not: the counter's end-of-meal list. */
export async function GET(_request: Request, ctx: RouteContext<"/api/meals/[id]/csv">) {
  const guard = await guardApi("manage_food");
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: meal } = await (await createClient()).from("meals").select("id, name").eq("id", id).maybeSingle<{ id: string; name: string }>();
  if (!meal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await createServiceClient()
    .from("participants")
    .select("full_name, participant_code, teams(name, team_code, status), meal_servings(served_at, method)")
    .eq("hackathon_id", guard.session.hackathonId)
    .eq("meal_servings.meal_id", id)
    .order("participant_code")
    .returns<Row[]>();
  const rows = (data ?? []).filter((p) => p.teams?.status !== "rejected").map((p) => {
    const s = p.meal_servings[0];
    return [p.participant_code, p.full_name, p.teams?.team_code, p.teams?.name, s ? "Served" : "Not yet", s?.served_at ?? "", s ? (s.method === "qr" ? "QR scan" : "Name search") : ""];
  });
  await audit(guard.session, "report.exported", { type: "report", id: "meal" }, { meal: meal.name, rows: rows.length });
  return new NextResponse(toCsv(["Participant ID", "Name", "Team ID", "Team", "Status", "Served at", "How"], rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition("attachment", `${meal.name.replace(/[^A-Za-z0-9]+/g, "_")}_servings.csv`),
      "Cache-Control": "no-store",
    },
  });
}
