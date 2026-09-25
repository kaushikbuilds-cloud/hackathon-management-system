/** Calendar months as "YYYY-MM" strings (reports are counted in India time). */
export const REPORT_TZ = "Asia/Kolkata";
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function currentMonth(now: number, timeZone = REPORT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(now));
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

/** A valid month no later than `latest`, else `latest`. */
export function parseMonth(value: unknown, latest: string): string {
  return typeof value === "string" && MONTH_RE.test(value) && value <= latest ? value : latest;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The months from `month - (count - 1)` to `month`, newest first. */
export function lastMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(month, -i));
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}
