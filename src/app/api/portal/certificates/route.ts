import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { certificateRecipients } from "@/lib/certificates";
import { eventFor } from "@/lib/certificate-routes";
import { deliverFile } from "@/lib/deliver";
import { generateCertificatesPdf } from "@/lib/pdf/certificates";
import { createClient } from "@/lib/supabase/server";
import { safeName } from "@/lib/zip";

/** A team's certificates (every checked-in member), once the organisers have ended the hackathon. */
export async function GET() {
  const session = await getSession();
  if (!session || session.profile.role !== "participant" || !session.hackathonId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: teamId } = await (await createClient()).rpc("my_team_id");
  if (!teamId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const loaded = await eventFor(session.hackathonId);
  if (!loaded || loaded.h.status !== "completed") return NextResponse.json({ error: "Certificates are available after the hackathon ends." }, { status: 403 });
  let people = await certificateRecipients(session.hackathonId, { teamId: teamId as string });
  // An older personal account downloads only its own certificate.
  if (session.profile.participant_id) people = people.filter((p) => p.participantId === session.profile.participant_id);
  if (!people.length) return NextResponse.json({ error: "No certificates: only members who checked in get one." }, { status: 404 });
  return deliverFile(await generateCertificatesPdf(loaded.ev, people), { name: `${people[0].teamCode}_${safeName(people[0].teamName)}_Certificates.pdf`, type: "application/pdf", hackathonId: session.hackathonId });
}
