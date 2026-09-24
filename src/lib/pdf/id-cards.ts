import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { A4, CARD_SIZES, type TemplateConfig } from "@/lib/domain/template";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type CardEvent = {
  name: string;
  tagline?: string | null;
  organizerName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  venue?: string | null;
  logo?: Uint8Array | null;
};

export type CardTeam = { name: string; teamCode: string };

export type CardMember = {
  participantCode: string;
  fullName: string;
  role: "leader" | "member";
  college?: string | null;
  department?: string | null;
  academicYear?: string | null;
  qrToken: string;
  qrRevoked?: boolean;
  photo?: Uint8Array | null;
};

export type CardInput = {
  event: CardEvent;
  team: CardTeam;
  members: CardMember[];
  template: TemplateConfig;
  templateVersion: number;
  /** Base URL encoded in QR codes: `${verifyBaseUrl}/verify/<token>` */
  verifyBaseUrl: string;
};

export type CardIssue = { participantCode?: string; field: string; message: string };

export type CardValidation = { errors: CardIssue[]; warnings: CardIssue[] };

// ---------------------------------------------------------------------------
// Validation: errors block generation, warnings are shown in the preview UI.
// ---------------------------------------------------------------------------
export function validateCardInput(input: Pick<CardInput, "event" | "team" | "members" | "template">): CardValidation {
  const errors: CardIssue[] = [];
  const warnings: CardIssue[] = [];
  const { event, team, members, template } = input;

  if (!event.name?.trim()) errors.push({ field: "event.name", message: "Hackathon name is not configured." });
  if (!team.name?.trim()) errors.push({ field: "team.name", message: "Team name is missing." });
  if (!team.teamCode?.trim()) errors.push({ field: "team.teamCode", message: "Team ID is missing." });
  if (members.length === 0) errors.push({ field: "members", message: "The team has no registered members." });
  if (members.filter((m) => m.role === "leader").length !== 1 && members.length > 0) {
    warnings.push({ field: "members", message: "The team does not have exactly one team leader." });
  }
  if (template.showEventDate && !event.startsAt) warnings.push({ field: "event.startsAt", message: "Event date is not configured; it will be omitted." });
  if (template.showVenue && !event.venue?.trim()) warnings.push({ field: "event.venue", message: "Venue is not configured; it will be omitted." });

  for (const m of members) {
    const code = m.participantCode || undefined;
    if (!m.participantCode?.trim()) errors.push({ participantCode: code, field: "participantCode", message: "Participant ID is missing." });
    if (!m.fullName?.trim()) errors.push({ participantCode: code, field: "fullName", message: "Participant name is missing." });
    if (!/^[0-9a-f]{64}$/.test(m.qrToken ?? "")) errors.push({ participantCode: code, field: "qrToken", message: "Verification token is missing or invalid." });
    if (m.qrRevoked) warnings.push({ participantCode: code, field: "qrToken", message: `${m.fullName}'s QR code is revoked; the card will not verify.` });
    if (template.showCollege && !m.college?.trim()) warnings.push({ participantCode: code, field: "college", message: `${m.fullName}: college is missing.` });
    if (template.showDepartment && !m.department?.trim()) warnings.push({ participantCode: code, field: "department", message: `${m.fullName}: department is missing.` });
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Fonts (embedded in full: pdf-lib subsetting corrupts Inter composite glyphs) — loaded once per server instance.
// ---------------------------------------------------------------------------
type FontBytes = { regular: Uint8Array; semibold: Uint8Array; bold: Uint8Array };
let fontCache: Promise<FontBytes> | null = null;

function loadFontBytes(): Promise<FontBytes> {
  if (!fontCache) {
    const dir = path.join(process.cwd(), "assets", "fonts");
    fontCache = Promise.all([
      readFile(path.join(dir, "Inter_400Regular.ttf")),
      readFile(path.join(dir, "Inter_600SemiBold.ttf")),
      readFile(path.join(dir, "Inter_700Bold.ttf")),
    ]).then(([regular, semibold, bold]) => ({ regular, semibold, bold }));
    fontCache.catch(() => {
      fontCache = null;
    });
  }
  return fontCache;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);
}

const WHITE = rgb(1, 1, 1);
const INK = rgb(0.07, 0.09, 0.16);
const MUTED = rgb(0.38, 0.42, 0.5);

/** Replaces characters the font cannot render so output never has missing glyphs. */
function safeText(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text.normalize("NFC"))
    .map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : ch.trim() === "" ? " " : "?"))
    .join("");
}

function ellipsize(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(text.slice(0, mid).trimEnd() + "…", size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "…";
}

/** Largest size in [min, max] at which text fits on one line; ellipsized at min. */
function fitOneLine(font: PDFFont, text: string, maxSize: number, minSize: number, maxWidth: number) {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  return { size, text: ellipsize(font, text, size, maxWidth) };
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) {
        current = words.slice(i).join(" ");
        break;
      }
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines).map((l) => ellipsize(font, l, size, maxWidth));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function formatEventDates(startsAt?: string | null, endsAt?: string | null, timeZone?: string | null): string {
  if (!startsAt) return "";
  const tz = timeZone || "UTC";
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz }).format(new Date(d));
    } catch {
      return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(d));
    }
  };
  const full = { day: "numeric", month: "short", year: "numeric" } as const;
  if (!endsAt) return fmt(startsAt, full);
  const s = fmt(startsAt, full);
  const e = fmt(endsAt, full);
  if (s === e) return s;
  const sMonthYear = fmt(startsAt, { month: "short", year: "numeric" });
  const eMonthYear = fmt(endsAt, { month: "short", year: "numeric" });
  if (sMonthYear === eMonthYear) return `${fmt(startsAt, { day: "numeric" })}–${e}`;
  return `${fmt(startsAt, { day: "numeric", month: "short" })} – ${e}`;
}

async function embedImage(doc: PDFDocument, bytes?: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 8) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
  } catch {
    return null; // Corrupt image: fall back to placeholder rather than failing the team PDF.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Card renderer. Layout is designed in "base units" for a CR80 card
// (153.07 × 242.65) and uniformly scaled; larger formats get extra room.
// ---------------------------------------------------------------------------
const BASE_W = 153.07;
const BASE_H = 242.65;

type Fonts = { regular: PDFFont; semibold: PDFFont; bold: PDFFont };

class CardCanvas {
  constructor(
    private page: PDFPage,
    private ox: number,
    private oy: number,
    private s: number,
    readonly W: number,
    readonly H: number,
  ) {}
  private X(x: number) {
    return this.ox + x * this.s;
  }
  private Y(yTop: number) {
    return this.oy + (this.H - yTop) * this.s;
  }
  rect(x: number, y: number, w: number, h: number, color: RGB, opts: { border?: RGB; borderWidth?: number } = {}) {
    this.page.drawRectangle({
      x: this.X(x), y: this.Y(y + h), width: w * this.s, height: h * this.s, color,
      borderColor: opts.border, borderWidth: opts.border ? (opts.borderWidth ?? 0.5) * this.s : undefined,
    });
  }
  outline(x: number, y: number, w: number, h: number, color: RGB, width = 0.6) {
    this.page.drawRectangle({ x: this.X(x), y: this.Y(y + h), width: w * this.s, height: h * this.s, borderColor: color, borderWidth: width * this.s });
  }
  text(t: string, x: number, baseline: number, font: PDFFont, size: number, color: RGB) {
    this.page.drawText(t, { x: this.X(x), y: this.Y(baseline), size: size * this.s, font, color });
  }
  centered(t: string, cx: number, baseline: number, font: PDFFont, size: number, color: RGB) {
    this.text(t, cx - font.widthOfTextAtSize(t, size) / 2, baseline, font, size, color);
  }
  image(img: PDFImage, x: number, y: number, w: number, h: number) {
    const scale = Math.min(w / img.width, h / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    this.page.drawImage(img, { x: this.X(x + (w - iw) / 2), y: this.Y(y + (h + ih) / 2), width: iw * this.s, height: ih * this.s });
  }
  qr(matrix: { size: number; get: (r: number, c: number) => number }, x: number, y: number, size: number, dark: RGB) {
    const quiet = 2;
    const cell = size / (matrix.size + quiet * 2);
    this.rect(x, y, size, size, WHITE);
    for (let r = 0; r < matrix.size; r++) {
      let c = 0;
      while (c < matrix.size) {
        if (!matrix.get(r, c)) {
          c++;
          continue;
        }
        let run = 1;
        while (c + run < matrix.size && matrix.get(r, c + run)) run++;
        // Tiny overlap avoids hairline gaps between modules in some viewers.
        this.rect(x + (quiet + c) * cell, y + (quiet + r) * cell, run * cell + 0.02, cell + 0.02, dark);
        c += run;
      }
    }
  }
}

function drawCropMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  const len = 12;
  const gap = 4;
  const color = rgb(0.5, 0.5, 0.5);
  const t = 0.4;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color });
  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1],
  ] as const) {
    line(cx + dx * gap, cy, cx + dx * (gap + len), cy);
    line(cx, cy + dy * gap, cx, cy + dy * (gap + len));
  }
}

type Shared = { fonts: Fonts; logo: PDFImage | null; header: RGB; accent: RGB; dates: string };

async function drawCard(doc: PDFDocument, input: CardInput, member: CardMember, shared: Shared) {
  const { template, event, team } = input;
  const card = CARD_SIZES[template.cardSize];
  const pageSize = template.pageLayout === "a4" ? A4 : card;
  const page = doc.addPage([pageSize.width, pageSize.height]);
  const ox = (pageSize.width - card.width) / 2;
  const oy = (pageSize.height - card.height) / 2;
  if (template.pageLayout === "a4") drawCropMarks(page, ox, oy, card.width, card.height);

  const s = Math.min(card.width / BASE_W, card.height / BASE_H);
  const W = card.width / s;
  const H = card.height / s;
  const c = new CardCanvas(page, ox, oy, s, W, H);
  const { fonts, header, accent } = shared;
  const f = (font: PDFFont, t: string) => safeText(font, t);
  const pad = 8;
  const cx = W / 2;

  // Background
  c.rect(0, 0, W, H, WHITE);

  // Header band: logo + event name + organiser/tagline
  const headerH = 44;
  c.rect(0, 0, W, headerH, header);
  c.rect(0, headerH, W, 2.5, accent);
  let textX = pad;
  if (shared.logo) {
    c.image(shared.logo, pad, 10, 24, 24);
    textX = pad + 24 + 6;
  }
  const titleWidth = W - textX - pad;
  const title = fitOneLine(fonts.bold, f(fonts.bold, event.name), 10, 6.5, titleWidth);
  const sub = f(fonts.regular, event.organizerName || event.tagline || "");
  if (sub) {
    c.text(title.text, textX, 21, fonts.bold, title.size, WHITE);
    const subFit = fitOneLine(fonts.regular, sub, 5.8, 4.5, titleWidth);
    c.text(subFit.text, textX, 30.5, fonts.regular, subFit.size, mix(WHITE, header, 0.3));
  } else {
    c.text(title.text, textX, 25.5, fonts.bold, title.size, WHITE);
  }

  // Bottom: footer band (dates / venue / footer text)
  const footerLines = [
    template.showEventDate ? shared.dates : "",
    template.showVenue ? event.venue ?? "" : "",
  ].filter(Boolean).join("  •  ");
  const footerText = template.footerText;
  const footerH = footerText && footerLines ? 20 : 14;
  const footerTop = H - footerH;
  c.rect(0, footerTop, W, footerH, header);
  if (footerLines) {
    const fl = fitOneLine(fonts.semibold, f(fonts.semibold, footerLines), 5.4, 4.2, W - pad * 2);
    c.centered(fl.text, cx, footerTop + (footerText ? 8.2 : 8.8), fonts.semibold, fl.size, WHITE);
  }
  if (footerText) {
    const ft = fitOneLine(fonts.regular, f(fonts.regular, footerText), 4.8, 4, W - pad * 2);
    c.centered(ft.text, cx, footerTop + (footerLines ? 15.6 : 8.8), fonts.regular, ft.size, mix(WHITE, header, 0.35));
  }

  // Lower section: participant/team details (left) + QR (right)
  const qrSize = 50;
  const lowerTop = footerTop - 6 - qrSize;
  const qrX = W - pad - qrSize;
  const matrix = QRCode.create(`${input.verifyBaseUrl.replace(/\/$/, "")}/verify/${member.qrToken}`, { errorCorrectionLevel: "M" }).modules;
  c.qr(matrix, qrX, lowerTop, qrSize, INK);
  c.outline(qrX, lowerTop, qrSize, qrSize, mix(WHITE, INK, 0.15), 0.4);

  const leftW = qrX - pad - 5;
  let y = lowerTop + 5;
  c.text("PARTICIPANT ID", pad, y, fonts.semibold, 4.4, MUTED);
  y += 8.6;
  const pid = fitOneLine(fonts.bold, member.participantCode, 8, 5.5, leftW);
  c.text(pid.text, pad, y, fonts.bold, pid.size, INK);
  y += 9.5;
  c.text("TEAM", pad, y, fonts.semibold, 4.4, MUTED);
  y += 7.6;
  const teamLines = wrap(fonts.bold, f(fonts.bold, team.name), 6.6, leftW, 2);
  for (const line of teamLines) {
    c.text(line, pad, y, fonts.bold, 6.6, INK);
    y += 7.4;
  }
  const tc = fitOneLine(fonts.semibold, team.teamCode, 5.6, 4.5, leftW);
  c.text(tc.text, pad, y, fonts.semibold, tc.size, accent);

  // Upper section: photo, name, role, college/department (flows top-down and
  // shrinks the photo if space is short).
  const infoParts = [
    template.showDepartment ? member.department : null,
    member.academicYear ? member.academicYear : null,
  ].filter((v): v is string => Boolean(v?.trim()));
  const college = template.showCollege ? member.college?.trim() ?? "" : "";
  const nameLines = wrap(fonts.bold, f(fonts.bold, member.fullName), 10.5, W - pad * 2, 2);
  const textBlockH =
    nameLines.length * 12 + 12 + (college ? 7.5 : 0) + (infoParts.length ? 7.5 : 0);
  const available = lowerTop - 8 - (headerH + 2.5 + 7);
  let photoH = template.showPhoto ? Math.min(52, Math.max(0, available - textBlockH - 6)) : 0;
  if (photoH < 24) photoH = 0;
  y = headerH + 2.5 + 7;
  if (photoH > 0) {
    const photoW = photoH * 0.85;
    const px = cx - photoW / 2;
    const photo = await embedImage(doc, member.photo);
    c.rect(px, y, photoW, photoH, mix(WHITE, accent, 0.12), { border: accent, borderWidth: 0.8 });
    if (photo) {
      c.image(photo, px + 1, y + 1, photoW - 2, photoH - 2);
    } else {
      const ini = f(fonts.bold, initials(member.fullName));
      c.centered(ini, cx, y + photoH / 2 + 5, fonts.bold, 14, accent);
    }
    y += photoH + 6;
  }
  for (const line of nameLines) {
    y += 10;
    c.centered(line, cx, y, fonts.bold, 10.5, INK);
    y += 2;
  }
  // Role pill
  const roleLabel = member.role === "leader" ? "TEAM LEADER" : "MEMBER";
  const pillW = fonts.bold.widthOfTextAtSize(roleLabel, 5.2) + 10;
  const pillTop = y + 3;
  if (member.role === "leader") {
    c.rect(cx - pillW / 2, pillTop, pillW, 8, accent);
    c.centered(roleLabel, cx, pillTop + 5.9, fonts.bold, 5.2, WHITE);
  } else {
    c.rect(cx - pillW / 2, pillTop, pillW, 8, WHITE, { border: accent, borderWidth: 0.6 });
    c.centered(roleLabel, cx, pillTop + 5.9, fonts.bold, 5.2, accent);
  }
  y = pillTop + 8;
  if (college) {
    y += 7.5;
    const cl = fitOneLine(fonts.semibold, f(fonts.semibold, college), 5.8, 4.4, W - pad * 2);
    c.centered(cl.text, cx, y, fonts.semibold, cl.size, INK);
  }
  if (infoParts.length) {
    y += 7.5;
    const il = fitOneLine(fonts.regular, f(fonts.regular, infoParts.join(" · ")), 5.4, 4.2, W - pad * 2);
    c.centered(il.text, cx, y, fonts.regular, il.size, MUTED);
  }
  if (template.additionalInfo && y + 12 < lowerTop - 2) {
    const ai = fitOneLine(fonts.regular, f(fonts.regular, template.additionalInfo), 5, 4, W - pad * 2);
    c.centered(ai.text, cx, lowerTop - 4, fonts.regular, ai.size, MUTED);
  }

  // Thin border so cards are easy to cut out.
  c.outline(0, 0, W, H, mix(WHITE, INK, 0.2), 0.3);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export type GeneratedPdf = { bytes: Uint8Array; pageCount: number; pageWidth: number; pageHeight: number };

export class CardValidationError extends Error {
  constructor(readonly issues: CardIssue[]) {
    super(issues.map((i) => i.message).join(" "));
    this.name = "CardValidationError";
  }
}

/**
 * Builds one PDF for a team: one single-sided portrait card per member, one
 * card per page, members ordered leader first then by Participant ID.
 */
export async function generateTeamIdCardsPdf(input: CardInput): Promise<GeneratedPdf> {
  const validation = validateCardInput(input);
  if (validation.errors.length) throw new CardValidationError(validation.errors);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const fonts: Fonts = {
    regular: await doc.embedFont(bytes.regular, { subset: false }),
    semibold: await doc.embedFont(bytes.semibold, { subset: false }),
    bold: await doc.embedFont(bytes.bold, { subset: false }),
  };
  const shared: Shared = {
    fonts,
    logo: await embedImage(doc, input.event.logo),
    header: hexToRgb(input.template.headerColor),
    accent: hexToRgb(input.template.accentColor),
    dates: formatEventDates(input.event.startsAt, input.event.endsAt, input.event.timezone),
  };

  const members = [...input.members].sort(
    (a, b) => Number(b.role === "leader") - Number(a.role === "leader") || a.participantCode.localeCompare(b.participantCode),
  );
  for (const member of members) {
    await drawCard(doc, input, member, shared);
  }

  doc.setTitle(`${input.team.name} (${input.team.teamCode}) — ID Cards`);
  doc.setSubject(`${input.event.name} participant ID cards, template v${input.templateVersion}`);
  doc.setCreator("Hackathon Management System");
  doc.setProducer("Hackathon Management System (pdf-lib)");
  doc.setCreationDate(new Date());

  const out = await doc.save();
  const pageSize = input.template.pageLayout === "a4" ? A4 : CARD_SIZES[input.template.cardSize];
  return { bytes: out, pageCount: doc.getPageCount(), pageWidth: pageSize.width, pageHeight: pageSize.height };
}
