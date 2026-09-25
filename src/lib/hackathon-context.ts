/**
 * The Super Admin "opens" one hackathon at a time; the choice is kept in a
 * cookie and sent to the database as the x-hackathon-id header. The database
 * honours the header only for the Super Admin (see current_hackathon_id()),
 * so the cookie cannot widen anyone else's access.
 */
export const HACKATHON_COOKIE = "hms_hackathon";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseHackathonId(value: string | undefined | null): string | null {
  return value && UUID_RE.test(value) ? value : null;
}
