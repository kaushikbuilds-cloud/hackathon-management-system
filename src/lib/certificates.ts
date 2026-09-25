import "server-only";
import { generateCertificatesPdf, type CertificateEvent, type CertificatePerson } from "@/lib/pdf/certificates";
import { BUCKETS, downloadObject } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/server";
import type { Hackathon } from "@/lib/types";

export type CertificateSettings = Pick<Hackathon, "id"> & {
  cert_signatory1_name?: string | null; cert_signatory1_title?: string | null; cert_signature1_path?: string | null;
  cert_signatory2_name?: string | null; cert_signatory2_title?: string | null; cert_signature2_path?: string | null;
  cert_note?: string | null;
};

export type Recipient = CertificatePerson & { participantId: string; teamId: string };

/** The event details, logos and signatures printed on every certificate. */
export async function certificateEvent(h: Hackathon & CertificateSettings): Promise<CertificateEvent> {
  const [logo, organizerLogo, sig1, sig2] = await Promise.all([
    downloadObject(BUCKETS.branding, h.logo_path), downloadObject(BUCKETS.branding, h.organizer_logo_path),
    downloadObject(BUCKETS.branding, h.cert_signature1_path), downloadObject(BUCKETS.branding, h.cert_signature2_path),
  ]);
  return {
    name: h.name, organizerName: h.organizer_name, venue: h.venue, startsAt: h.starts_at, endsAt: h.ends_at, timezone: h.timezone,
    brand: { background: h.primary_color, accent: h.accent_color }, logo, organizerLogo, note: h.cert_note ?? null,
    signatories: [
      { name: h.cert_signatory1_name ?? "", title: h.cert_signatory1_title ?? null, signature: sig1 },
      { name: h.cert_signatory2_name ?? "", title: h.cert_signatory2_title ?? null, signature: sig2 },
    ],
  };
}

/**
 * Who gets a certificate: everyone who checked in, in teams that were not
 * rejected (award-winning teams get achievement certificates). Callers must
 * have checked access; this reads through the service client, scoped to the hackathon.
 */
export async function certificateRecipients(hackathonId: string, filter: { teamId?: string } = {}): Promise<Recipient[]> {
  let q = createServiceClient().from("certificate_recipients")
    .select("participant_id, participant_code, full_name, college, team_id, team_code, team_name, award")
    .eq("hackathon_id", hackathonId).order("team_code").order("participant_code");
  if (filter.teamId) q = q.eq("team_id", filter.teamId);
  const { data } = await q.returns<{ participant_id: string; participant_code: string; full_name: string; college: string | null; team_id: string; team_code: string; team_name: string; award: string | null }[]>();
  return (data ?? []).map((r) => ({
    participantId: r.participant_id, teamId: r.team_id, participantCode: r.participant_code, fullName: r.full_name,
    college: r.college, teamName: r.team_name, teamCode: r.team_code, award: r.award,
  }));
}

export function certificateFileName(p: Pick<CertificatePerson, "fullName" | "participantCode">): string {
  return `${p.participantCode}_${p.fullName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_Certificate.pdf`;
}

/** One PDF per person, keyed by a folder-friendly path (team/person). */
export async function certificateFiles(ev: CertificateEvent, people: Recipient[]): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const p of people) {
    const team = `${p.teamCode}_${p.teamName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    files[`${team}/${certificateFileName(p)}`] = await generateCertificatesPdf(ev, [p]);
  }
  return files;
}
