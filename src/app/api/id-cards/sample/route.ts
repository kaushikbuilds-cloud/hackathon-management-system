import { NextResponse } from "next/server";
import { contentDisposition, guardApi } from "@/lib/api";
import { getHackathon } from "@/lib/data/event";
import { resolveTemplateConfig } from "@/lib/domain/template";
import { appUrl } from "@/lib/env";
import { generateTeamIdCardsPdf } from "@/lib/pdf/id-cards";
import { BUCKETS, downloadObject } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/server";
import type { IdCardTemplate } from "@/lib/types";

export const runtime = "nodejs";

/** Renders the active template with clearly fake sample people (for template review only). */
export async function GET() {
  const guard = await guardApi(["generate_pdf", "manage_event"]);
  if (guard.response) return guard.response;
  const supabase = createServiceClient();
  const [hackathon, { data: template }] = await Promise.all([
    getHackathon(),
    supabase.from("id_card_templates").select("*").eq("hackathon_id", guard.session.hackathonId).eq("is_active", true).maybeSingle<IdCardTemplate>(),
  ]);
  if (!hackathon) return NextResponse.json({ error: "Event not configured" }, { status: 400 });
  const token = (n: number) => `${"0".repeat(63)}${n}`;
  const pdf = await generateTeamIdCardsPdf({
    event: {
      name: hackathon.name, tagline: hackathon.tagline, organizerName: hackathon.organizer_name, startsAt: hackathon.starts_at,
      endsAt: hackathon.ends_at, timezone: hackathon.timezone, venue: hackathon.venue, logo: await downloadObject(BUCKETS.branding, hackathon.logo_path),
    },
    team: { name: "Sample Team", teamCode: `TEAM-${hackathon.id_year}-0000` },
    members: [
      { participantCode: `PRT-${hackathon.id_year}-0000`, fullName: "Sample Leader", role: "leader", college: hackathon.organizer_name ?? "Sample College", department: "Computer Science", academicYear: "3rd Year", qrToken: token(1) },
      { participantCode: `PRT-${hackathon.id_year}-0001`, fullName: "Sample Member With A Longer Name", role: "member", college: "Another College of Engineering", department: "Electronics", academicYear: "2nd Year", qrToken: token(2) },
    ],
    template: resolveTemplateConfig(template?.config),
    templateVersion: template?.version ?? 0,
    verifyBaseUrl: appUrl(),
  });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": contentDisposition("inline", "SAMPLE_ID_Cards.pdf"), "Cache-Control": "no-store" },
  });
}
