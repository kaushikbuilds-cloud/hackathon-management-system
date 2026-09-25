/**
 * Human-readable identifiers. The database generates them (sequences +
 * triggers, see `public.format_code`); these helpers mirror the format for
 * validation and display only — never generate IDs client-side.
 */
/** Current form: the hackathon's prefix + T/P + a per-hackathon number (SAMPLE1-T0001). Older IDs keep TEAM-YYYY-NNNN / PRT-YYYY-NNNN. */
export const TEAM_CODE_PATTERN = /^(?:[A-Z0-9]{2,10}-T\d{4,}|TEAM-\d{4}-\d{4,})$/;
export const PARTICIPANT_CODE_PATTERN = /^(?:[A-Z0-9]{2,10}-P\d{4,}|PRT-\d{4}-\d{4,})$/;
export const CODE_PREFIX_PATTERN = /^[A-Z0-9]{2,10}$/;
/** A food shop's login ID, e.g. SAMPLE1-S01. */
export const SHOP_CODE_PATTERN = /^[A-Z0-9]{2,10}-S\d{2,}$/;

export function formatCode(prefix: string, kind: "T" | "P", n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("Sequence value must be a positive integer");
  return `${prefix}-${kind}${String(n).padStart(4, "0")}`;
}

/**
 * Tidies a typed Team / Participant ID: upper case, no spaces, and in the
 * number part the letters people confuse with digits (O → 0, I/L → 1).
 */
export function normalizeIdInput(value: string): string {
  const v = value.trim().toUpperCase().replace(/\s+/g, "");
  const m = v.match(/^([A-Z0-9]{2,10}-[TP])([0-9OIL]{4,})$/);
  return m ? m[1] + m[2].replace(/O/g, "0").replace(/[IL]/g, "1") : v;
}

/** Message for someone who typed a Participant ID where the Team ID is needed (logins are per team). */
export function participantIdInsteadOfTeamId(value: string): string | null {
  const v = normalizeIdInput(value);
  if (!isParticipantCode(v)) return null;
  const prefix = v.match(/^([A-Z0-9]{2,10})-P\d/)?.[1];
  return `${v} is a Participant ID. Your team signs in with its Team ID${prefix ? ` (it looks like ${prefix}-T0001)` : ""}, printed on every member's ID card.`;
}

export function isTeamCode(value: string): boolean {
  return TEAM_CODE_PATTERN.test(value.trim().toUpperCase());
}

export function isParticipantCode(value: string): boolean {
  return PARTICIPANT_CODE_PATTERN.test(value.trim().toUpperCase());
}

/** QR tokens are 64 lowercase hex characters (see generate_opaque_token). */
export function isQrToken(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** Extracts a verification token from a scanned QR payload (URL or bare token). */
export function extractQrToken(scanned: string): string | null {
  const text = scanned.trim();
  if (isQrToken(text)) return text;
  const match = text.match(/\/verify\/([0-9a-f]{64})(?:[/?#]|$)/);
  return match ? match[1] : null;
}
