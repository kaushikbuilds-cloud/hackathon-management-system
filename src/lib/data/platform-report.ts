import "server-only";
import { REPORT_TZ, lastMonths, shiftMonth } from "@/lib/domain/months";
import { totalsByMonth, type MonthTotals, type ReportRow } from "@/lib/domain/report";
import { createClient } from "@/lib/supabase/server";

export type { MonthTotals, ReportRow };

export const REPORT_MONTHS = 12;

/** Per-hackathon activity for the 12 months ending with `month` (Super Admin only; the database checks). */
export async function loadMonthlyReport(month: string): Promise<{ rows: ReportRow[]; totals: MonthTotals[] }> {
  const from = `${shiftMonth(month, -(REPORT_MONTHS - 1))}-01`;
  const { data, error } = await (await createClient()).rpc("platform_monthly_report", { p_from: from, p_to: `${month}-01`, p_tz: REPORT_TZ });
  if (error) throw new Error("The monthly report could not be loaded.");
  const rows: ReportRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    month: String(r.month).slice(0, 7),
    hackathon_id: String(r.hackathon_id),
    hackathon_name: String(r.hackathon_name),
    teams: Number(r.teams), participants: Number(r.participants), checked_in: Number(r.checked_in),
    fees_verified: Number(r.fees_verified), fees_pending: Number(r.fees_pending),
    food_orders: Number(r.food_orders), food_revenue: Number(r.food_revenue), support_opened: Number(r.support_opened),
  }));
  return { rows, totals: totalsByMonth(rows, lastMonths(month, REPORT_MONTHS)) };
}
