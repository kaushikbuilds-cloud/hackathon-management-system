/**
 * Sanitises free-text search input before it is embedded in a PostgREST
 * `or=(...)` filter: removes filter syntax characters and LIKE wildcards.
 */
export function sanitizeSearch(input: string | null | undefined, maxLength = 80): string {
  if (!input) return "";
  return input
    .replace(/[,()*%_\\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function parsePage(value: string | string[] | undefined, fallback = 1): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : fallback;
}

export function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}
