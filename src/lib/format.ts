/** Date/time display helpers (event timezone aware). */
export function formatDateTime(value: string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

export function formatDate(value: string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}

export function formatTime(value: string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone }).format(new Date(value));
}

/** Value for <input type="datetime-local"> in the event timezone. */
export function toLocalInput(value: string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Converts a datetime-local value interpreted in `timeZone` to an ISO string. */
export function fromLocalInput(value: string | null | undefined, timeZone = "UTC"): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const asUtc = new Date(`${value}:00Z`);
  // Offset of the zone at that instant, found by formatting the UTC guess back into the zone.
  const zoned = toLocalInput(asUtc.toISOString(), timeZone);
  const diff = new Date(`${zoned}:00Z`).getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - diff).toISOString();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Current time in epoch ms, read at request time on the server. */
export function requestTime(): number {
  return Date.now();
}
