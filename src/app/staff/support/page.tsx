import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/client";
import { SupportBadge } from "@/components/status";
import { Card, EmptyState, LinkButton, PageHeader, Stat, Table, Td, Th, inputClass } from "@/components/ui";
import { can, requireStaff } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { param, type SearchParams } from "@/lib/data/query";
import { pickEnum } from "@/lib/domain/search";
import { SUPPORT_STATUSES, supportCategoryLabel, supportStatusLabel } from "@/lib/domain/support";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SupportRequest } from "@/lib/types";

export const metadata: Metadata = { title: "Help & Support" };

type Row = SupportRequest & { teams: { name: string; team_code: string } | null; assignee: { full_name: string | null } | null };

export default async function StaffSupportPage(props: PageProps<"/staff/support">) {
  const session = await requireStaff();
  const sp = (await props.searchParams) as SearchParams;
  const status = pickEnum(param(sp, "status"), SUPPORT_STATUSES);
  const mine = param(sp, "mine") === "1";
  const supabase = await createClient();
  const hackathon = await getHackathon();

  // RLS limits officials without the manage_all_support permission to their assigned requests.
  let query = supabase
    .from("support_requests")
    .select("*, teams(name, team_code), assignee:profiles!support_requests_assigned_to_fkey(full_name)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  if (mine) query = query.eq("assigned_to", session.userId);
  const [{ data }, { data: all }] = await Promise.all([query.returns<Row[]>(), supabase.from("support_requests").select("status").returns<{ status: string }[]>()]);
  const totals = Object.fromEntries(SUPPORT_STATUSES.map((s) => [s, (all ?? []).filter((r) => r.status === s).length]));

  return (
    <>
      <PageHeader
        title="Help & Support"
        description={can(session, "manage_all_support") ? "All team support requests." : "Support requests assigned to you."}
        actions={can(session, "manage_all_support") && <LinkButton href="/api/reports/support" variant="secondary" prefetch={false}>Export CSV</LinkButton>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {SUPPORT_STATUSES.map((s) => <Stat key={s} label={supportStatusLabel(s)} value={totals[s]} tone={s === "new" ? "blue" : s === "resolved" ? "green" : s === "in_progress" ? "amber" : "violet"} />)}
      </div>
      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-center gap-3">
          <label htmlFor="f-status" className="sr-only">Status</label>
          <AutoSubmitSelect id="f-status" name="status" defaultValue={status ?? ""} className={`${inputClass} max-w-48`}>
            <option value="">Status: all</option>
            {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{supportStatusLabel(s)}</option>)}
          </AutoSubmitSelect>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="accent-violet-500" />
            Assigned to me
          </label>
          <button type="submit" className="text-sm text-violet-300 underline">Apply</button>
        </form>
      </Card>
      {!data?.length ? (
        <EmptyState title="No support requests" />
      ) : (
        <Table caption="Support requests">
          <thead><tr><Th>Subject</Th><Th>Team</Th><Th>Category</Th><Th>Status</Th><Th>Assigned to</Th><Th>Updated</Th></tr></thead>
          <tbody className="divide-y divide-navy-800">
            {data.map((r) => (
              <tr key={r.id} className="hover:bg-navy-850/40">
                <Td><Link className="font-medium text-blue-300 hover:underline" href={`/staff/support/${r.id}`}>{r.subject}</Link></Td>
                <Td>{r.teams?.name} <span className="font-mono text-xs text-slate-400">{r.teams?.team_code}</span></Td>
                <Td>{supportCategoryLabel(r.category)}</Td>
                <Td><SupportBadge status={r.status} /></Td>
                <Td>{r.assignee?.full_name ?? <span className="text-slate-500">Unassigned</span>}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(r.updated_at, hackathon?.timezone)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
