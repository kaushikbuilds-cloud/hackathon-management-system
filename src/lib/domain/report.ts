/** The owner's monthly report: rows per hackathon per month, and totals per month. */

export type ReportRow = {
  month: string; // YYYY-MM
  hackathon_id: string;
  hackathon_name: string;
  teams: number;
  participants: number;
  checked_in: number;
  fees_verified: number;
  fees_pending: number;
  food_orders: number;
  food_revenue: number;
  support_opened: number;
};

export type MonthTotals = Omit<ReportRow, "hackathon_id" | "hackathon_name"> & { hackathons: number };

export function totalsByMonth(rows: ReportRow[], months: string[]): MonthTotals[] {
  return months.map((m) => {
    const list = rows.filter((r) => r.month === m);
    const sum = (k: keyof MonthTotals & keyof ReportRow) => list.reduce((a, r) => a + (r[k] as number), 0);
    return {
      month: m, hackathons: list.length,
      teams: sum("teams"), participants: sum("participants"), checked_in: sum("checked_in"),
      fees_verified: sum("fees_verified"), fees_pending: sum("fees_pending"),
      food_orders: sum("food_orders"), food_revenue: sum("food_revenue"), support_opened: sum("support_opened"),
    };
  });
}
