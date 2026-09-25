import { z } from "zod";

/** Physical card sizes in PDF points (1 pt = 1/72 in). Portrait. */
export const CARD_SIZES = {
  cr80: { label: "CR80 badge (54 × 85.6 mm)", width: 153.07, height: 242.65 },
  a7: { label: "A7 (74 × 105 mm)", width: 209.76, height: 297.64 },
  badge3x4: { label: "Event badge (3 × 4 in)", width: 216, height: 288 },
  a6: { label: "A6 (105 × 148 mm)", width: 297.64, height: 419.53 },
  badge4x6: { label: "Event badge (4 × 6 in)", width: 288, height: 432 },
} as const;
export type CardSize = keyof typeof CARD_SIZES;

export const A4 = { width: 595.28, height: 841.89 };

/** A4 sheet layout: 10 mm margins, 5 mm between cards for cutting. */
export const SHEET_MARGIN = 28.35;
export const SHEET_GAP = 14.17;

/**
 * How many cards of this size fit on one A4 sheet. Uses 10 mm margins and a
 * 5 mm cutting gap; if packing the cards edge to edge fits more (e.g. four A6
 * on A4), it packs them tightly instead and the card edges are the cut lines.
 */
export function sheetGrid(cardSize: CardSize) {
  const card = CARD_SIZES[cardSize];
  const fit = (margin: number, gap: number) => {
    const cols = Math.max(1, Math.floor((A4.width - 2 * margin + gap + 0.5) / (card.width + gap)));
    const rows = Math.max(1, Math.floor((A4.height - 2 * margin + gap + 0.5) / (card.height + gap)));
    return { cols, rows, perPage: cols * rows, gap, tight: margin === 0 };
  };
  const spaced = fit(SHEET_MARGIN, SHEET_GAP);
  const tight = fit(0, 0);
  return tight.perPage > spaced.perPage ? tight : spaced;
}

export const PAGE_LAYOUTS = {
  sheet: "A4 sheets, cards tiled with crop marks (print & cut)",
  card: "Page = card size (one card per page)",
  a4: "A4, one card centred with crop marks",
} as const;

/** Human description of the layout, e.g. "A6 … — 4 per A4 sheet". */
export function layoutSummary(config: Pick<TemplateConfig, "cardSize" | "pageLayout">): string {
  const size = CARD_SIZES[config.cardSize].label;
  if (config.pageLayout === "sheet") return `${size} — ${sheetGrid(config.cardSize).perPage} per A4 sheet, with crop marks`;
  if (config.pageLayout === "a4") return `${size}, one per A4 page with crop marks`;
  return `${size}, page = card`;
}

/** PDF page count for a team of this size. */
export function pageCount(config: Pick<TemplateConfig, "cardSize" | "pageLayout">, members: number): number {
  return config.pageLayout === "sheet" ? Math.ceil(members / sheetGrid(config.cardSize).perPage) : members;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1d4ed8");

export const templateConfigSchema = z.object({
  cardSize: z.enum(["cr80", "a7", "badge3x4", "a6", "badge4x6"]).default("cr80"),
  /**
   * "sheet": as many cards as fit tiled on each A4 sheet with crop marks.
   * "card": page size equals the card. "a4": one card centred on A4 with crop marks.
   */
  pageLayout: z.enum(["sheet", "card", "a4"]).default("sheet"),
  headerColor: hex.default("#141414"),
  accentColor: hex.default("#2f3fe0"),
  showPhoto: z.boolean().default(true),
  showCollege: z.boolean().default(true),
  showDepartment: z.boolean().default(true),
  showEventDate: z.boolean().default(true),
  showVenue: z.boolean().default(true),
  footerText: z.string().trim().max(80).default(""),
  additionalInfo: z.string().trim().max(120).default(""),
});
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = templateConfigSchema.parse({});

export function resolveTemplateConfig(raw: unknown): TemplateConfig {
  const parsed = templateConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_TEMPLATE_CONFIG;
}
