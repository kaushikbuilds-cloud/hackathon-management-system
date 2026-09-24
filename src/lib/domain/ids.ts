/**
 * Human-readable identifiers. The database generates them (sequences +
 * triggers, see `public.format_code`); these helpers mirror the format for
 * validation and display only — never generate IDs client-side.
 */
export const TEAM_CODE_PATTERN = /^TEAM-\d{4}-\d{4,}$/;
export const PARTICIPANT_CODE_PATTERN = /^PRT-\d{4}-\d{4,}$/;

export function formatCode(prefix: "TEAM" | "PRT", year: number, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("Sequence value must be a positive integer");
  return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
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
