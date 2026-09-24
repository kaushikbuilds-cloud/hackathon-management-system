import { z } from "zod";

/** Physical card sizes in PDF points (1 pt = 1/72 in). Portrait. */
export const CARD_SIZES = {
  cr80: { label: "CR80 badge (54 × 85.6 mm)", width: 153.07, height: 242.65 },
  a6: { label: "A6 (105 × 148 mm)", width: 297.64, height: 419.53 },
  badge4x6: { label: "Event badge (4 × 6 in)", width: 288, height: 432 },
} as const;
export type CardSize = keyof typeof CARD_SIZES;

export const A4 = { width: 595.28, height: 841.89 };

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1d4ed8");

export const templateConfigSchema = z.object({
  cardSize: z.enum(["cr80", "a6", "badge4x6"]).default("cr80"),
  /** "card": page size equals the card. "a4": card centred on A4 with crop marks. */
  pageLayout: z.enum(["card", "a4"]).default("card"),
  headerColor: hex.default("#0b1535"),
  accentColor: hex.default("#6d5dfc"),
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
