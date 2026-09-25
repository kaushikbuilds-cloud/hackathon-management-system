import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { A4, CARD_SIZES, sheetGrid, type TemplateConfig } from "@/lib/domain/template";

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
  organizerLogo?: Uint8Array | null;
  /** The hackathon's brand kit colours; they override the template's colours. */
  brand?: { background: string; accent: string } | null;
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
  /** One-time code printed on the card to activate the portal account. */
  activationCode?: string | null;
  /** The participant already has a portal account (no code printed). */
  activated?: boolean;
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

/** Largest size in [min, max] at which text wraps into maxLines without truncation (truncated at min). */
function fitWrap(font: PDFFont, text: string, maxSize: number, minSize: number, maxWidth: number, maxLines: number) {
  for (let size = maxSize; size > minSize; size -= 0.25) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.some((w) => font.widthOfTextAtSize(w, size) > maxWidth)) continue;
    const lines = wrap(font, text, size, maxWidth, maxLines + 1);
    if (lines.length <= maxLines) return { size, lines };
  }
  return { size: minSize, lines: wrap(font, text, minSize, maxWidth, maxLines) };
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
  /** Rounded rectangle; widths are in base units. */
  round(x: number, y: number, w: number, h: number, r: number, opts: { fill?: RGB; border?: RGB; borderWidth?: number; opacity?: number }) {
    r = Math.min(r, w / 2, h / 2);
    const d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(d, {
      x: this.X(x), y: this.Y(y), scale: this.s, color: opts.fill, opacity: opts.opacity,
      borderColor: opts.border, borderWidth: opts.border ? (opts.borderWidth ?? 0.5) : undefined, borderOpacity: opts.opacity,
    });
  }
  path(d: string, x: number, y: number, opts: { fill?: RGB; border?: RGB; borderWidth?: number; opacity?: number }) {
    this.page.drawSvgPath(d, {
      x: this.X(x), y: this.Y(y), scale: this.s, color: opts.fill, opacity: opts.opacity,
      borderColor: opts.border, borderWidth: opts.border ? (opts.borderWidth ?? 0.5) : undefined, borderOpacity: opts.opacity,
    });
  }
  circle(cx: number, cy: number, r: number, color: RGB, opacity = 1) {
    this.page.drawEllipse({ x: this.X(cx), y: this.Y(cy), xScale: r * this.s, yScale: r * this.s, color, opacity });
  }
  line(x1: number, y1: number, x2: number, y2: number, color: RGB, width = 0.4, opacity = 1) {
    this.page.drawLine({ start: { x: this.X(x1), y: this.Y(y1) }, end: { x: this.X(x2), y: this.Y(y2) }, thickness: width * this.s, color, opacity });
  }
  /** Text with extra space between letters (for small uppercase labels). */
  spaced(t: string, x: number, baseline: number, font: PDFFont, size: number, color: RGB, spacing: number) {
    let cx = x;
    for (const ch of t) {
      this.text(ch, cx, baseline, font, size, color);
      cx += font.widthOfTextAtSize(ch, size) + spacing;
    }
  }
  spacedWidth(t: string, font: PDFFont, size: number, spacing: number) {
    return font.widthOfTextAtSize(t, size) + Math.max(0, t.length - 1) * spacing;
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

type Shared = { fonts: Fonts; logo: PDFImage | null; organizerLogo: PDFImage | null; header: RGB; accent: RGB; dates: string };

/** Where each card goes: one page per card, or tiled on A4 sheets. */
function placeCards(doc: PDFDocument, template: TemplateConfig, count: number): { page: PDFPage; ox: number; oy: number }[] {
  const card = CARD_SIZES[template.cardSize];
  const slots: { page: PDFPage; ox: number; oy: number }[] = [];
  if (template.pageLayout !== "sheet") {
    const pageSize = template.pageLayout === "a4" ? A4 : card;
    for (let i = 0; i < count; i++) {
      const page = doc.addPage([pageSize.width, pageSize.height]);
      slots.push({ page, ox: (pageSize.width - card.width) / 2, oy: (pageSize.height - card.height) / 2 });
    }
    return slots;
  }
  const { cols, rows, perPage, gap } = sheetGrid(template.cardSize);
  const gridW = cols * card.width + (cols - 1) * gap;
  const gridH = rows * card.height + (rows - 1) * gap;
  const left = (A4.width - gridW) / 2;
  const top = (A4.height + gridH) / 2;
  let page: PDFPage | null = null;
  for (let i = 0; i < count; i++) {
    const n = i % perPage;
    if (n === 0) page = doc.addPage([A4.width, A4.height]);
    const col = n % cols;
    const row = Math.floor(n / cols);
    slots.push({ page: page!, ox: left + col * (card.width + gap), oy: top - (row + 1) * card.height - row * gap });
  }
  return slots;
}

async function drawCard(
  page: PDFPage, ox: number, oy: number, input: CardInput, member: CardMember, shared: Shared,
) {
  const { template, event, team } = input;
  const card = CARD_SIZES[template.cardSize];
  const tight = template.pageLayout === "sheet" && sheetGrid(template.cardSize).tight;
  if (template.pageLayout !== "card" && !tight) drawCropMarks(page, ox, oy, card.width, card.height);

  const s = Math.min(card.width / BASE_W, card.height / BASE_H);
  const W = card.width / s;
  const H = card.height / s;
  const c = new CardCanvas(page, ox, oy, s, W, H);
  const { fonts, header: bg, accent } = shared;
  const f = (font: PDFFont, t: string) => safeText(font, t);
  const pad = 9;
  const cx = W / 2;
  const light = luminance(bg) > 0.55;
  const fg = light ? INK : WHITE;
  const soft = mix(fg, bg, 0.35);
  const faint = mix(fg, bg, 0.75);
  const accent2 = mix(accent, WHITE, 0.35);
  // Text on accent-filled boxes: ink on light accents, white on dark ones (keeps 4.5:1+).
  const onAccent = contrastRatio(accent, WHITE) >= 4.5 ? WHITE : INK;

  // Background with soft accent glows and a thin inner frame.
  c.rect(0, 0, W, H, bg);
  // Glows are drawn as shapes clipped to the card edge so tiled cards never overlap.
  c.path(`M ${W - 50} 0 A 50 50 0 0 0 ${W} 50 L ${W} 0 Z`, 0, 0, { fill: accent, opacity: 0.28 });
  c.path(`M 0 ${H - 84} A 42 42 0 0 1 0 ${H} Z`, 0, 0, { fill: accent, opacity: 0.16 });
  c.path(`M ${W} ${H - 92} A 30 30 0 0 0 ${W} ${H - 32} Z`, 0, 0, { fill: accent2, opacity: 0.1 });
  c.round(3, 3, W - 6, H - 6, 7, { border: accent, borderWidth: 0.35, opacity: 0.45 });

  // Lanyard slot.
  c.round(cx - 17, 7, 34, 6.5, 3.25, { fill: mix(bg, WHITE, 0.08), border: soft, borderWidth: 0.5, opacity: 0.9 });

  // Header: logo, event name + tagline | dates + venue.
  const top = 20;
  const logoS = 25;
  if (shared.logo) c.image(shared.logo, pad, top, logoS, logoS);
  else drawHexLogo(c, pad, top, logoS, accent);
  const divX = W * 0.66;
  const titleX = pad + logoS + 5;
  const titleW = divX - titleX - 4;
  const title = fitWrap(fonts.bold, f(fonts.bold, event.name.toUpperCase()), 8.6, 4.6, titleW, 2);
  const titleLines = title.lines;
  let ty = top + (titleLines.length > 1 ? 4 + title.size * 0.8 : 8 + title.size * 0.5);
  titleLines.forEach((line, i) => {
    c.text(line, titleX, ty, fonts.bold, title.size, i === titleLines.length - 1 && titleLines.length > 1 ? accent2 : fg);
    ty += title.size * 1.12;
  });
  ty += 1.5;
  const tagline = f(fonts.semibold, (event.tagline || "").toUpperCase());
  if (tagline) {
    let size = 3.6;
    while (size > 2.6 && c.spacedWidth(tagline, fonts.semibold, size, 0.8) > titleW) size -= 0.2;
    c.spaced(ellipsize(fonts.semibold, tagline, size, titleW), titleX, ty - 1.5, fonts.semibold, size, soft, 0.8);
  }
  c.line(divX, top - 1, divX, top + logoS + 3, faint, 0.4);
  const infoX = divX + 5;
  const infoW = W - pad - infoX + 2;
  let iy = top + 4;
  const infoRow = (icon: "cal" | "pin", text: string) => {
    const lines = wrap(fonts.semibold, f(fonts.semibold, text), 4.1, infoW - 6, 2);
    drawIcon(c, icon, infoX, iy - 3.2, 4, fg);
    lines.forEach((l, k) => c.text(l, infoX + 6, iy + k * 5, fonts.semibold, 4.1, fg));
    iy += lines.length * 5 + 3.5;
  };
  if (template.showEventDate && shared.dates) infoRow("cal", shared.dates);
  if (template.showVenue && event.venue?.trim()) infoRow("pin", event.venue.trim());

  // Footer: "Organized by" (or custom footer text).
  const footerH = 20;
  const footerTop = H - footerH - 3;
  c.line(pad, footerTop, W - pad, footerTop, faint, 0.4);
  const orgLine = f(fonts.semibold, (template.footerText || event.organizerName || "").toUpperCase());
  // Organiser logo (brand kit) sits at the left of the footer; the text centres in the remaining space.
  const orgLogoS = shared.organizerLogo ? 13 : 0;
  if (shared.organizerLogo) c.image(shared.organizerLogo, pad, footerTop + 3.5, orgLogoS, orgLogoS);
  const textLeft = pad + (orgLogoS ? orgLogoS + 3 : 0);
  const textW = W - pad - textLeft;
  const fcx = textLeft + textW / 2;
  if (orgLine) {
    const lbl = "ORGANIZED BY";
    const showLabel = !template.footerText;
    if (showLabel) c.spaced(lbl, fcx - c.spacedWidth(lbl, fonts.regular, 3.3, 0.9) / 2, footerTop + 7.5, fonts.regular, 3.3, soft, 0.9);
    let size = 4.2;
    while (size > 3 && c.spacedWidth(orgLine, fonts.semibold, size, 0.6) > textW) size -= 0.2;
    const shown = ellipsize(fonts.semibold, orgLine, size, textW);
    c.spaced(shown, fcx - c.spacedWidth(shown, fonts.semibold, size, 0.6) / 2, footerTop + (showLabel ? 14 : 11), fonts.semibold, size, fg, 0.6);
  }

  // Lower block (bottom-aligned above the footer): QR + Participant ID | Team ID + activation.
  const gap = 5;
  const colW = (W - pad * 2 - gap) / 2;
  const qrBox = Math.min(colW, 58);
  const pidBoxH = 11;
  const lowerBottom = footerTop - 5;
  const pidBoxTop = lowerBottom - pidBoxH;
  const pidLabelY = pidBoxTop - 2.5;
  const qrTop = pidLabelY - 6 - (qrBox + 7);
  const qx = pad + (colW - qrBox) / 2;
  c.round(qx, qrTop, qrBox, qrBox + 7, 4, { fill: WHITE });
  const matrix = QRCode.create(`${input.verifyBaseUrl.replace(/\/$/, "")}/verify/${member.qrToken}`, { errorCorrectionLevel: "M" }).modules;
  const qrSize = qrBox - 4;
  c.qr(matrix, qx + 2, qrTop + 2, qrSize, INK);
  c.centered("Scan for verification", qx + qrBox / 2, qrTop + qrBox + 4, fonts.semibold, 3.6, INK);
  c.text("Participant ID", pad, pidLabelY, fonts.regular, 3.8, soft);
  c.round(pad, pidBoxTop, colW, pidBoxH, 3, { fill: mix(bg, accent, 0.12), border: accent, borderWidth: 0.5 });
  const pid = fitOneLine(fonts.bold, member.participantCode, 6.6, 4.2, colW - 6);
  c.text(pid.text, pad + 3.5, pidBoxTop + 7.6, fonts.bold, pid.size, fg);

  const px = pad + colW + gap;
  const panelTop = qrTop;
  c.round(px, panelTop, colW, lowerBottom - panelTop, 5, { fill: mix(bg, accent, 0.1), border: accent2, borderWidth: 0.45, opacity: 0.95 });
  const inX = px + 3.5;
  const inW = colW - 7;
  let py = panelTop + 8;
  const valueBox = (label: string, value: string, icon: "user" | "lock") => {
    drawIcon(c, icon, inX, py - 3.3, 3.6, fg);
    c.text(label, inX + 5.5, py, fonts.bold, 3.6, fg);
    py += 2.5;
    c.round(inX, py, inW, 10.5, 3, { fill: accent });
    const v = fitOneLine(fonts.bold, value, 6.2, 3.8, inW - 5);
    c.text(v.text, inX + 2.8, py + 7.3, fonts.bold, v.size, onAccent);
    py += 10.5 + 7;
  };
  valueBox("TEAM ID", team.teamCode, "user");
  const host = input.verifyBaseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  let note: [string, string, string];
  if (member.activationCode) {
    valueBox("TEAM LOGIN CODE", member.activationCode, "lock");
    note = ["Activate your team login at", `${host}/activate`, "with the Team ID and this one-time code. One password for the whole team."];
  } else if (member.activated) {
    note = ["Team login active. Sign in at", host, "with your Team ID and team password."];
  } else {
    note = ["Participant portal:", host, ""];
  }
  let ny = py - 2;
  for (const l of wrap(fonts.regular, note[0], 3.5, inW, 2)) { c.text(l, inX, ny, fonts.regular, 3.5, soft); ny += 4.4; }
  const url = fitOneLine(fonts.semibold, note[1], 3.8, 2.4, inW);
  c.text(url.text, inX, ny, fonts.semibold, url.size, fg);
  ny += 4.6;
  for (const l of wrap(fonts.regular, note[2], 3.5, inW, 3)) { c.text(l, inX, ny, fonts.regular, 3.5, soft); ny += 4.4; }

  // Upper block: role pill, name, team, details — flows down from the header.
  let y = top + logoS + 10;
  c.line(pad, y - 4, W - pad, y - 4, faint, 0.4);
  const roleLabel = member.role === "leader" ? "TEAM LEADER" : "PARTICIPANT";
  const pillW = fonts.bold.widthOfTextAtSize(roleLabel, 4.6) + 9;
  c.round(pad, y, pillW, 8, 2.5, { fill: accent });
  c.text(roleLabel, pad + 4.5, y + 5.7, fonts.bold, 4.6, onAccent);
  y += 8;
  const name = fitWrap(fonts.bold, f(fonts.bold, member.fullName.toUpperCase()), 12, 7, W - pad * 2, 2);
  for (const line of name.lines) {
    y += name.size * 1.05;
    c.text(line, pad, y, fonts.bold, name.size, fg);
  }
  y += 9;
  const tm = fitOneLine(fonts.bold, f(fonts.bold, `Team ${team.name}`), 7.6, 5, W - pad * 2);
  c.text(tm.text, pad, y, fonts.bold, tm.size, accent2);
  const rows: { icon: "cap" | "book" | "people"; text: string }[] = [];
  if (template.showCollege && member.college?.trim()) rows.push({ icon: "cap", text: member.college.trim() });
  const dept = [template.showDepartment ? member.department?.trim() : "", member.academicYear?.trim()].filter(Boolean).join(" · ");
  if (dept) rows.push({ icon: "book", text: dept });
  rows.push({ icon: "people", text: member.role === "leader" ? "Team Leader" : "Team Member" });
  const rowH = 7.8;
  y += 3;
  for (const row of rows) {
    if (y + rowH > qrTop - 4) break;
    y += rowH;
    drawIcon(c, row.icon, pad, y - 3.6, 4.2, fg);
    const t = fitOneLine(fonts.regular, f(fonts.regular, row.text), 5, 3.8, W - pad * 2 - 8);
    c.text(t.text, pad + 8, y, fonts.regular, t.size, fg);
  }
  if (template.additionalInfo && y + 7 < qrTop - 4) {
    const ai = fitOneLine(fonts.regular, f(fonts.regular, template.additionalInfo), 4, 3.4, W - pad * 2);
    c.text(ai.text, pad, qrTop - 4, fonts.regular, ai.size, soft);
  }
  c.line(pad, qrTop - 2.5, W - pad, qrTop - 2.5, faint, 0.3, 0.6);

  // Thin cut border.
  c.outline(0, 0, W, H, mix(WHITE, INK, 0.2), 0.3);
}

function luminance(c: RGB): number {
  return 0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue;
}

/** WCAG contrast ratio between two colours. */
function contrastRatio(a: RGB, b: RGB): number {
  const rel = (c: RGB) => {
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c.red) + 0.7152 * f(c.green) + 0.0722 * f(c.blue);
  };
  const [x, y] = [rel(a), rel(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Default logo when the event has none: a hexagon "network" mark. */
function drawHexLogo(c: CardCanvas, x: number, y: number, size: number, color: RGB) {
  const r = size / 2;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [r + r * 0.95 * Math.cos(a), r + r * 0.95 * Math.sin(a)] as const;
  });
  const inner = pts.map(([px, py]) => [r + (px - r) * 0.55, r + (py - r) * 0.55] as const);
  c.path(`M ${pts.map(([a, b]) => `${a} ${b}`).join(" L ")} Z`, x, y, { border: color, borderWidth: 1.6 });
  c.path(`M ${inner.map(([a, b]) => `${a} ${b}`).join(" L ")} Z`, x, y, { border: color, borderWidth: 0.9 });
  for (const [a, b] of inner) {
    c.line(x + r, y + r, x + a, y + b, color, 0.7);
    c.circle(x + a, y + b, 1.5, color);
  }
  c.circle(x + r, y + r, 2.3, color);
}

/** Minimal line icons drawn with primitives (no icon font needed). */
function drawIcon(c: CardCanvas, icon: "cal" | "pin" | "cap" | "book" | "people" | "user" | "lock", x: number, y: number, s: number, color: RGB) {
  const w = 0.45;
  switch (icon) {
    case "cal":
      c.round(x, y + s * 0.15, s, s * 0.85, s * 0.15, { border: color, borderWidth: w });
      c.line(x, y + s * 0.42, x + s, y + s * 0.42, color, w);
      c.line(x + s * 0.3, y, x + s * 0.3, y + s * 0.28, color, w);
      c.line(x + s * 0.7, y, x + s * 0.7, y + s * 0.28, color, w);
      break;
    case "pin":
      c.path(`M ${s / 2} ${s} L ${s * 0.12} ${s * 0.45} A ${s * 0.4} ${s * 0.4} 0 1 1 ${s * 0.88} ${s * 0.45} Z`, x, y, { fill: color });
      c.circle(x + s / 2, y + s * 0.38, s * 0.15, WHITE);
      break;
    case "cap":
      c.path(`M 0 ${s * 0.4} L ${s / 2} ${s * 0.15} L ${s} ${s * 0.4} L ${s / 2} ${s * 0.65} Z`, x, y, { fill: color });
      c.path(`M ${s * 0.22} ${s * 0.55} V ${s * 0.85} Q ${s / 2} ${s} ${s * 0.78} ${s * 0.85} V ${s * 0.55}`, x, y, { border: color, borderWidth: w });
      break;
    case "book":
      c.path(`M ${s / 2} ${s * 0.25} Q ${s * 0.25} ${s * 0.1} 0 ${s * 0.2} V ${s * 0.9} Q ${s * 0.25} ${s * 0.8} ${s / 2} ${s * 0.95} Z`, x, y, { border: color, borderWidth: w });
      c.path(`M ${s / 2} ${s * 0.25} Q ${s * 0.75} ${s * 0.1} ${s} ${s * 0.2} V ${s * 0.9} Q ${s * 0.75} ${s * 0.8} ${s / 2} ${s * 0.95} Z`, x, y, { border: color, borderWidth: w });
      break;
    case "people":
      c.circle(x + s * 0.5, y + s * 0.3, s * 0.17, color);
      c.path(`M ${s * 0.22} ${s * 0.9} Q ${s * 0.5} ${s * 0.35} ${s * 0.78} ${s * 0.9} Z`, x, y, { fill: color });
      c.circle(x + s * 0.15, y + s * 0.42, s * 0.12, color);
      c.circle(x + s * 0.85, y + s * 0.42, s * 0.12, color);
      break;
    case "user":
      c.circle(x + s / 2, y + s * 0.3, s * 0.22, color);
      c.path(`M ${s * 0.1} ${s} Q ${s / 2} ${s * 0.35} ${s * 0.9} ${s} Z`, x, y, { fill: color });
      break;
    case "lock":
      c.round(x + s * 0.12, y + s * 0.45, s * 0.76, s * 0.55, s * 0.08, { fill: color });
      c.path(`M ${s * 0.28} ${s * 0.45} V ${s * 0.3} A ${s * 0.22} ${s * 0.22} 0 0 1 ${s * 0.72} ${s * 0.3} V ${s * 0.45}`, x, y, { border: color, borderWidth: w * 1.3 });
      break;
  }
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
 * card per page or tiled on A4 sheets ready to print and cut, members ordered leader first then by Participant ID.
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
    header: hexToRgb(input.event.brand?.background ?? input.template.headerColor),
    accent: hexToRgb(input.event.brand?.accent ?? input.template.accentColor),
    organizerLogo: await embedImage(doc, input.event.organizerLogo),
    dates: formatEventDates(input.event.startsAt, input.event.endsAt, input.event.timezone),
  };

  const members = [...input.members].sort(
    (a, b) => Number(b.role === "leader") - Number(a.role === "leader") || a.participantCode.localeCompare(b.participantCode),
  );
  const slots = placeCards(doc, input.template, members.length);
  for (const [i, member] of members.entries()) {
    await drawCard(slots[i].page, slots[i].ox, slots[i].oy, input, member, shared);
  }

  doc.setTitle(`${input.team.name} (${input.team.teamCode}) — ID Cards`);
  doc.setSubject(`${input.event.name} participant ID cards, template v${input.templateVersion}`);
  doc.setCreator("HackathonBase");
  doc.setProducer("HackathonBase (pdf-lib)");
  doc.setCreationDate(new Date());

  const out = await doc.save();
  const pageSize = input.template.pageLayout === "card" ? CARD_SIZES[input.template.cardSize] : A4;
  return { bytes: out, pageCount: doc.getPageCount(), pageWidth: pageSize.width, pageHeight: pageSize.height };
}
