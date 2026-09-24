import type { Metadata } from "next";
import { Card, EmptyState, LinkButton, PageHeader, Pagination, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { hrefWith, param, type SearchParams } from "@/lib/data/query";
import { parsePage, sanitizeSearch } from "@/lib/domain/search";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Audit Logs" };
const PAGE_SIZE = 50;

export default async function AuditPage(props: PageProps<"/staff/audit">) {
  await requireAdmin();
  const sp = (await props.searchParams) as SearchParams;
  const action = sanitizeSearch(param(sp, "action"), 60);
  const page = parsePage(sp.page);
  const supabase = await createClient();
  let query = supabase.from("audit_logs").select("*", { count: "exact" });
  if (action) query = query.ilike("action", `%${action}%`);
  const { data, count } = await query.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<AuditLog[]>();
  const actorIds = [...new Set((data ?? []).map((a) => a.actor_id).filter((v): v is string => Boolean(v)))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds).returns<Pick<Profile, "id" | "full_name" | "email">[]>() : { data: [] };
  const names = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email ?? a.id]));
  const tz = (await getHackathon())?.timezone ?? "UTC";

  return (
    <>
      <PageHeader title="Audit Logs" description="Security events, registration edits, attendance corrections, PDF generation, credential and permission changes. Passwords are never logged."
        actions={<LinkButton variant="secondary" href="/api/reports/audit" prefetch={false}>Export CSV</LinkButton>} />
      <Card className="mb-4 p-4">
        <form className="flex gap-2" role="search">
          <label htmlFor="action" className="sr-only">Filter by action</label>
          <input id="action" name="action" defaultValue={action} placeholder="Filter by action, e.g. attendance, teams.update, auth.sign_in" className={inputClass} />
          <button className={buttonClass("primary")}>Filter</button>
        </form>
      </Card>
      {!data?.length ? (
        <EmptyState title="No audit entries" />
      ) : (
        <>
          <Table caption="Audit log">
            <thead><tr><Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Details</Th></tr></thead>
            <tbody className="divide-y divide-navy-800">
              {data.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(a.created_at, tz)}</Td>
                  <Td>{a.actor_id ? names.get(a.actor_id) ?? a.actor_id.slice(0, 8) : <span className="text-slate-500">system / public</span>}<div className="text-xs text-slate-400">{a.actor_role}</div></Td>
                  <Td className="font-mono text-xs">{a.action}</Td>
                  <Td className="font-mono text-xs">{a.entity_type}{a.entity_id && <div className="text-slate-500">{a.entity_id.slice(0, 13)}</div>}</Td>
                  <Td><pre className="max-w-xl overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-400">{JSON.stringify(a.details).slice(0, 500)}</pre></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(n) => hrefWith("/staff/audit", sp, { page: n })} />
        </>
      )}
    </>
  );
}
