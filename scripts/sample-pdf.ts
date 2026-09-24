// Renders a sample team PDF to ./tmp-sample.pdf for visual checks (dev only).
import { writeFile } from "node:fs/promises";
import { generateTeamIdCardsPdf } from "../src/lib/pdf/id-cards";
import { resolveTemplateConfig } from "../src/lib/domain/template";

const [cardSize = "cr80", pageLayout = "card", out = "tmp-sample.pdf"] = process.argv.slice(2);
const tok = (n: number) => n.toString(16).padStart(64, "a");
async function main() {
const pdf = await generateTeamIdCardsPdf({
  event: { name: "BuildFest 2026", organizerName: "Riverside Institute of Technology", startsAt: "2026-11-14T03:30:00Z", endsAt: "2026-11-15T15:30:00Z", timezone: "Asia/Kolkata", venue: "Innovation Hall, Riverside Institute" },
  team: { name: "The Extraordinarily Long Named Quantum Quokkas", teamCode: "TEAM-2026-0003" },
  members: [
    { participantCode: "PRT-2026-0007", fullName: "Arjun Nair", role: "member", college: "Riverside Institute of Technology", department: "Physics", academicYear: "2nd Year", qrToken: tok(7) },
    { participantCode: "PRT-2026-0006", fullName: "Saraswati Venkataraghavan Krishnamurthy", role: "leader", college: "Riverside Institute of Technology", department: "Mathematics", academicYear: "2nd Year", qrToken: tok(6) },
    { participantCode: "PRT-2026-0008", fullName: "Zoë Łukasiewicz", role: "member", college: null, department: null, qrToken: tok(8) },
  ],
  template: resolveTemplateConfig({ cardSize, pageLayout, footerText: "Wear this card at all times" }),
  templateVersion: 1,
  verifyBaseUrl: "https://hms.example.com",
});
await writeFile(out, pdf.bytes);
console.log(JSON.stringify({ pages: pdf.pageCount, w: pdf.pageWidth, h: pdf.pageHeight, bytes: pdf.bytes.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
