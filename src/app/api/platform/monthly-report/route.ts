import { NextResponse, type NextRequest } from "next/server";
import { contentDisposition, guardApi } from "@/lib/api";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/domain/csv";
import { currentMonth, parseMonth, shiftMonth } from "@/lib/domain/months";
import { REPORT_MONTHS, loadMonthlyReport } from "@/lib/data/platform-report";
import { requestTime } from "@/lib/format";

/** The owner's 12-month report as CSV: one row per hackathon per month. */
export async function GET(request: NextRequest) {
  const guard = await guardApi("super_admin");
  if ("response" in guard) return guard.response;
  const month = parseMonth(request.nextUrl.searchParams.get("month"), currentMonth(requestTime()));
  const { rows } = await loadMonthlyReport(month);
  const csv = toCsv(
    ["Month", "Hackathon", "Teams registered", "Participants registered", "Checked in", "Fees verified (INR)", "Payments awaiting check", "Food orders", "Food sales collected (INR)", "Support requests"],
    rows.map((r) => [r.month, r.hackathon_name, r.teams, r.participants, r.checked_in, r.fees_verified, r.fees_pending, r.food_orders, r.food_revenue, r.support_opened]),
  );
  await audit(guard.session, "report.exported", { type: "report", id: "platform_monthly" }, { month, rows: rows.length });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition("attachment", `HackathonBase_report_${shiftMonth(month, -(REPORT_MONTHS - 1))}_to_${month}.csv`),
      "Cache-Control": "no-store",
    },
  });
}
