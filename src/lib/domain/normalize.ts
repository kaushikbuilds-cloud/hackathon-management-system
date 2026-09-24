/**
 * Team-name normalisation. MUST stay in sync with the SQL function
 * `public.normalize_team_name` (supabase/migrations/..._schema.sql), which is
 * what actually enforces uniqueness in the database.
 */
export function normalizeTeamName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Display form of a team name: trimmed with internal whitespace collapsed. */
export function cleanTeamName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * File-system safe representation of a team name, used in PDF filenames:
 * diacritics stripped, runs of non-alphanumerics become "_", max 60 chars.
 */
export function toFileSafeName(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const safe = ascii
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/g, "");
  return safe || "Team";
}

/** `<NormalizedTeamName>_<TeamID>_ID_Cards.pdf` */
export function teamPdfFileName(teamName: string, teamCode: string): string {
  return `${toFileSafeName(teamName)}_${teamCode.replace(/[^A-Za-z0-9-]/g, "")}_ID_Cards.pdf`;
}
