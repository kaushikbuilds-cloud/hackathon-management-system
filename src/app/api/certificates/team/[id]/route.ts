import { NextResponse } from "next/server";
import { UUID } from "@/lib/actions";
import { guardApi } from "@/lib/api";
import { certificateRecipients } from "@/lib/certificates";
import { eventFor } from "@/lib/certificate-routes";
import { deliverFile } from "@/lib/deliver";
import { generateCertificatesPdf } from "@/lib/pdf/certificates";
import { safeName } from "@/lib/zip";

/** One team's certificates in a single PDF (a page per member). */
export async function GET(_request: Request, ctx: RouteContext<"/api/certificates/team/[id]">) {
  const guard = await guardApi("manage_event");
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const loaded = await eventFor(guard.session.hackathonId);
  const people = await certificateRecipients(guard.session.hackathonId, { teamId: id });
  if (!loaded || !people.length) return NextResponse.json({ error: "No certificates for this team." }, { status: 404 });
  return deliverFile(await generateCertificatesPdf(loaded.ev, people), { name: `${people[0].teamCode}_${safeName(people[0].teamName)}_Certificates.pdf`, type: "application/pdf", hackathonId: guard.session.hackathonId });
}
