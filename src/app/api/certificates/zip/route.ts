import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api";
import { audit } from "@/lib/audit";
import { certificateFiles, certificateRecipients } from "@/lib/certificates";
import { eventFor } from "@/lib/certificate-routes";
import { deliverFile } from "@/lib/deliver";
import { makeZip, safeName } from "@/lib/zip";

/** Every certificate, one PDF per person in a folder per team. */
export async function GET() {
  const guard = await guardApi("manage_event");
  if ("response" in guard) return guard.response;
  const loaded = await eventFor(guard.session.hackathonId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const people = await certificateRecipients(guard.session.hackathonId);
  if (!people.length) return NextResponse.json({ error: "Nobody has checked in yet." }, { status: 404 });
  const zip = makeZip(await certificateFiles(loaded.ev, people));
  await audit(guard.session, "report.exported", { type: "report", id: "certificates" }, { count: people.length });
  return deliverFile(zip, { name: `${safeName(loaded.h.name)}_certificates.zip`, type: "application/zip", hackathonId: guard.session.hackathonId });
}
