import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/bar-list";
import { Card, CardTitle, EmptyState, PageHeader, Stat, Table, Td, Th, buttonClass } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { loadMonthlyReport } from "@/lib/data/platform-report";
import { formatRupees } from "@/lib/domain/fees";
import { currentMonth, monthLabel, parseMonth, shiftMonth } from "@/lib/domain/months";
import { requestTime } from "@/lib/format";

export const metadata: Metadata = { title: "Monthly Reports" };

/** The platform owner's month-end view across every hackathon. */
export default async function MonthlyReportsPage(props: PageProps<"/staff/monthly-reports">) {
  await requireSuperAdmin();
  const sp = await props.searchParams;
  const latest = currentMonth(requestTime());
  const month = parseMonth(sp.month, latest);
  const { rows, totals } = await loadMonthlyReport(month);
  const now = totals[0];
  const before = totals[1];
  const detail = rows.filter((r) => r.month === month);
  const change = (a: number, b: number) => (b === 0 ? (a === 0 ? "No change" : "New this month") : `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs ${monthLabel(before.month)}`);

  return (
    <>
      <PageHeader
        title="Monthly Reports"
        description="Activity across every hackathon on the platform, counted by calendar month (India time)."
        actions={<a href={`/api/platform/monthly-report?month=${month}`} className={buttonClass("secondary")}>Download CSV (12 months)</a>}
      />
      <nav aria-label="Choose month" className="mb-6 flex flex-wrap items-center gap-2">
        <Link href={`/staff/monthly-reports?month=${shiftMonth(month, -1)}`} className={buttonClass("secondary", "sm")}>← {monthLabel(shiftMonth(month, -1))}</Link>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="month" className="sr-only">Month</label>
          <input id="month" name="month" type="month" defaultValue={month} max={latest} className="min-h-9 rounded-md border-2 border-line bg-surface px-2 text-sm" />
          <button type="submit" className={buttonClass("primary", "sm")}>Show</button>
        </form>
        {month < latest && <Link href={`/staff/monthly-reports?month=${shiftMonth(month, 1)}`} className={buttonClass("secondary", "sm")}>{monthLabel(shiftMonth(month, 1))} →</Link>}
      </nav>

      <h2 className="mb-3 text-2xl font-bold text-ink">{monthLabel(month)}</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active hackathons" value={now.hackathons} hint="With any activity this month" tone="violet" />
        <Stat label="Teams registered" value={now.teams} hint={change(now.teams, before.teams)} />
        <Stat label="Participants" value={now.participants} hint={`${now.checked_in} checked in`} tone="green" />
        <Stat label="Fees verified" value={formatRupees(now.fees_verified)} hint={`${now.fees_pending} payments awaiting check`} tone="amber" />
        <Stat label="Food orders" value={now.food_orders} hint={`${formatRupees(now.food_revenue)} collected at paid counters`} tone="green" />
        <Stat label="Support requests" value={now.support_opened} tone="violet" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle description="What each hackathon did this month.">By hackathon</CardTitle>
          {!detail.length ? <EmptyState title="No activity this month" /> : (
            <Table caption={`Activity by hackathon, ${monthLabel(month)}`}>
              <thead><tr><Th>Hackathon</Th><Th>Teams</Th><Th>Participants</Th><Th>Checked in</Th><Th>Fees verified</Th><Th>Food orders</Th><Th>Support</Th></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {detail.map((r) => (
                  <tr key={r.hackathon_id}>
                    <Td className="font-bold"><Link href={`/staff/hackathons/${r.hackathon_id}`} className="text-grass hover:underline">{r.hackathon_name}</Link></Td>
                    <Td>{r.teams}</Td><Td>{r.participants}</Td><Td>{r.checked_in}</Td>
                    <Td>{formatRupees(r.fees_verified)}</Td><Td>{r.food_orders}</Td><Td>{r.support_opened}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardTitle description="Last 12 months">Teams registered</CardTitle>
          <BarList items={[...totals].reverse().map((t) => ({ label: monthLabel(t.month), value: t.teams }))} max={12} />
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle description="Totals across all hackathons.">Last 12 months</CardTitle>
        <Table caption="Monthly totals, last 12 months">
          <thead><tr><Th>Month</Th><Th>Hackathons</Th><Th>Teams</Th><Th>Participants</Th><Th>Checked in</Th><Th>Fees verified</Th><Th>Food orders</Th><Th>Food sales</Th><Th>Support</Th></tr></thead>
          <tbody className="divide-y divide-line-soft">
            {totals.map((t) => (
              <tr key={t.month} className={t.month === month ? "bg-pop/40" : undefined}>
                <Td className="font-bold"><Link href={`/staff/monthly-reports?month=${t.month}`} className="text-grass hover:underline">{monthLabel(t.month)}</Link></Td>
                <Td>{t.hackathons}</Td><Td>{t.teams}</Td><Td>{t.participants}</Td><Td>{t.checked_in}</Td>
                <Td>{formatRupees(t.fees_verified)}</Td><Td>{t.food_orders}</Td><Td>{formatRupees(t.food_revenue)}</Td><Td>{t.support_opened}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
