import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { embedImage, formatEventDates, hexToRgb, loadFontBytes, mix, safeText } from "@/lib/pdf/id-cards";

export type CertificateEvent = {
  name: string;
  organizerName: string | null;
  venue: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  brand: { background: string; accent: string };
  logo?: Uint8Array | null;
  organizerLogo?: Uint8Array | null;
  note?: string | null;
  signatories: { name: string; title: string | null; signature?: Uint8Array | null }[];
};

export type CertificatePerson = {
  fullName: string;
  college: string | null;
  teamName: string;
  teamCode: string;
  participantCode: string;
  /** Set for members of an award-winning team: a certificate of achievement. */
  award?: string | null;
};

const W = 841.89; // A4 landscape, points
const H = 595.28;
const INK = rgb(0.07, 0.09, 0.16);
const SOFT = rgb(0.36, 0.39, 0.45);
const PAPER = rgb(1, 0.995, 0.975);

type Fonts = { regular: PDFFont; semibold: PDFFont; bold: PDFFont };

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, maxW = W - 180) {
  let s = size;
  const t = safeText(font, text);
  while (s > 8 && font.widthOfTextAtSize(t, s) > maxW) s -= 0.5;
  page.drawText(t, { x: (W - font.widthOfTextAtSize(t, s)) / 2, y, size: s, font, color });
}

function spacedCentered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, spacing: number) {
  const chars = Array.from(safeText(font, text));
  const width = chars.reduce((w, ch) => w + font.widthOfTextAtSize(ch, size) + spacing, -spacing);
  let x = (W - width) / 2;
  for (const ch of chars) {
    page.drawText(ch, { x, y, size, font, color });
    x += font.widthOfTextAtSize(ch, size) + spacing;
  }
}

function wrapCentered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, maxW: number, lineGap: number): number {
  const words = safeText(font, text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxW && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => page.drawText(l, { x: (W - font.widthOfTextAtSize(l, size)) / 2, y: y - i * lineGap, size, font, color }));
  return y - Math.min(lines.length, 3) * lineGap;
}

function drawLogo(page: PDFPage, img: PDFImage | null, x: number, yTop: number, maxW: number, maxH: number, alignRight = false) {
  if (!img) return;
  const s = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * s;
  const h = img.height * s;
  page.drawImage(img, { x: alignRight ? x - w : x, y: yTop - h, width: w, height: h });
}

function drawCertificate(page: PDFPage, fonts: Fonts, ev: CertificateEvent, p: CertificatePerson,
  img: { logo: PDFImage | null; organizerLogo: PDFImage | null; signatures: (PDFImage | null)[] }) {
  const brand = hexToRgb(ev.brand.background);
  const accent = hexToRgb(ev.brand.accent);
  const achievement = Boolean(p.award);

  // Paper, brand frame and corner accents.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: brand, borderWidth: 10 });
  page.drawRectangle({ x: 34, y: 34, width: W - 68, height: H - 68, borderColor: accent, borderWidth: 1.5 });
  for (const [x, y] of [[34, H - 34], [W - 34, H - 34], [34, 34], [W - 34, 34]]) {
    page.drawRectangle({ x: x - 9, y: y - 9, width: 18, height: 18, color: accent, rotate: undefined });
  }

  drawLogo(page, img.logo, 64, H - 58, 150, 58);
  drawLogo(page, img.organizerLogo, W - 64, H - 58, 150, 58, true);

  spacedCentered(page, "CERTIFICATE", H - 118, fonts.bold, 38, brand, 6);
  spacedCentered(page, achievement ? "OF ACHIEVEMENT" : "OF PARTICIPATION", H - 146, fonts.semibold, 15, accent.red + accent.green + accent.blue > 2.2 ? mix(accent, INK, 0.45) : accent, 5);

  centered(page, "This is to certify that", H - 196, fonts.regular, 14, SOFT);
  centered(page, p.fullName, H - 244, fonts.bold, 38, INK, W - 200);
  page.drawRectangle({ x: W / 2 - 170, y: H - 258, width: 340, height: 1.5, color: accent });
  if (p.college) centered(page, `of ${p.college}`, H - 282, fonts.semibold, 13, SOFT);

  const dates = formatEventDates(ev.startsAt, ev.endsAt, ev.timezone);
  const where = [dates && `on ${dates}`, ev.venue && `at ${ev.venue}`].filter(Boolean).join(" ");
  const body = achievement
    ? `as a member of team ${p.teamName}, has been awarded ${p.award} at ${ev.name}${where ? ` held ${where}` : ""}${ev.organizerName ? `, organised by ${ev.organizerName}` : ""}.`
    : `as a member of team ${p.teamName}, has successfully participated in ${ev.name}${where ? ` held ${where}` : ""}${ev.organizerName ? `, organised by ${ev.organizerName}` : ""}.`;
  let y = wrapCentered(page, body, H - 318, fonts.regular, 14, INK, W - 240, 21);
  if (achievement) {
    const label = safeText(fonts.bold, p.award!.toUpperCase());
    const lw = fonts.bold.widthOfTextAtSize(label, 15) + 36;
    y -= 12;
    page.drawRectangle({ x: (W - lw) / 2, y: y - 14, width: lw, height: 30, color: accent });
    const on = accent.red * 0.299 + accent.green * 0.587 + accent.blue * 0.114 > 0.6 ? INK : rgb(1, 1, 1);
    page.drawText(label, { x: (W - fonts.bold.widthOfTextAtSize(label, 15)) / 2, y: y - 4, size: 15, font: fonts.bold, color: on });
    y -= 26;
  }
  if (ev.note) wrapCentered(page, ev.note, y - 12, fonts.regular, 11, SOFT, W - 260, 15);

  // Signatures along the bottom.
  const sigs = ev.signatories.filter((s) => s.name.trim());
  const slots = sigs.length === 2 ? [W * 0.27, W * 0.73] : [W / 2];
  sigs.slice(0, 2).forEach((s, i) => {
    const cx = slots[i];
    const sig = img.signatures[i];
    if (sig) {
      const sc = Math.min(150 / sig.width, 44 / sig.height);
      page.drawImage(sig, { x: cx - (sig.width * sc) / 2, y: 112, width: sig.width * sc, height: sig.height * sc });
    }
    page.drawRectangle({ x: cx - 95, y: 106, width: 190, height: 1, color: INK });
    const name = safeText(fonts.bold, s.name);
    page.drawText(name, { x: cx - fonts.bold.widthOfTextAtSize(name, 12) / 2, y: 90, size: 12, font: fonts.bold, color: INK });
    if (s.title) {
      const t = safeText(fonts.regular, s.title);
      page.drawText(t, { x: cx - fonts.regular.widthOfTextAtSize(t, 10) / 2, y: 76, size: 10, font: fonts.regular, color: SOFT });
    }
  });

  const idText = safeText(fonts.regular, `Certificate ID: ${p.participantCode}  ·  Team ${p.teamCode}`);
  page.drawText(idText, { x: (W - fonts.regular.widthOfTextAtSize(idText, 8.5)) / 2, y: 48, size: 8.5, font: fonts.regular, color: SOFT });
}

/** True when every character can be drawn with the built-in PDF fonts (no embedding needed). */
function fitsStandardFonts(font: PDFFont, texts: string[]): boolean {
  const supported = new Set(font.getCharacterSet());
  return texts.every((t) => Array.from(t.normalize("NFC")).every((ch) => supported.has(ch.codePointAt(0)!) || ch.trim() === ""));
}

/**
 * One PDF with a page per person (a single person gives a single-page
 * certificate). Uses the built-in PDF fonts, so each certificate is ~15 KB;
 * names in other scripts fall back to embedding Inter.
 */
export async function generateCertificatesPdf(ev: CertificateEvent, people: CertificatePerson[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${ev.name} certificates`);
  doc.setCreator("HackathonBase");
  const standard: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    semibold: await doc.embedFont(StandardFonts.HelveticaBold),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const texts = [ev.name, ev.organizerName ?? "", ev.venue ?? "", ev.note ?? "", ...ev.signatories.flatMap((s) => [s.name, s.title ?? ""]),
    ...people.flatMap((p) => [p.fullName, p.college ?? "", p.teamName, p.award ?? ""])];
  let fonts = standard;
  if (!fitsStandardFonts(standard.regular, texts)) {
    const bytes = await loadFontBytes();
    fonts = {
      regular: await doc.embedFont(bytes.regular, { subset: false }),
      semibold: await doc.embedFont(bytes.semibold, { subset: false }),
      bold: await doc.embedFont(bytes.bold, { subset: false }),
    };
  }
  const img = {
    logo: await embedImage(doc, ev.logo),
    organizerLogo: await embedImage(doc, ev.organizerLogo),
    signatures: await Promise.all(ev.signatories.slice(0, 2).map((s) => embedImage(doc, s.signature))),
  };
  for (const person of people) drawCertificate(doc.addPage([W, H]), fonts, ev, person, img);
  return doc.save();
}
