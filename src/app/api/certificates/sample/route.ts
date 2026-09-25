import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api";
import { certificateRecipients } from "@/lib/certificates";
import { eventFor, fileResponse } from "@/lib/certificate-routes";
import { generateCertificatesPdf } from "@/lib/pdf/certificates";

/** Two sample pages (participation and achievement) with the current details. */
export async function GET() {
  const guard = await guardApi("manage_event");
  if ("response" in guard) return guard.response;
  const loaded = await eventFor(guard.session.hackathonId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const real = (await certificateRecipients(guard.session.hackathonId)).slice(0, 1)[0];
  const prefix = loaded.h.code_prefix ?? "SAMPLE";
  const person = real ?? { fullName: "Sample Participant", college: loaded.h.organizer_name ?? "Sample College", teamName: "Sample Team", teamCode: `${prefix}-T0001`, participantCode: `${prefix}-P0001` };
  const pdf = await generateCertificatesPdf(loaded.ev, [{ ...person, award: null }, { ...person, award: real?.award || "Winner" }]);
  return fileResponse(pdf, "application/pdf", "Certificate_sample.pdf", true);
}
