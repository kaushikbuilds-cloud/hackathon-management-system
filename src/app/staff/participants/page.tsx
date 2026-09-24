import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/client";
import { AttendanceBadge } from "@/components/status";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Pagination, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { hrefWith, param, type SearchParams } from "@/lib/data/query";
import { parsePage, pickEnum, sanitizeSearch } from "@/lib/domain/search";
import { createClient } from "@/lib/supabase/server";
import type { ParticipantOverview } from "@/lib/types";

export const metadata: Metadata = { title: "Participants" };
const PAGE_SIZE = 25;

export default async function ParticipantsPage(props: PageProps<"/staff/participants">) {
  await requireStaff();
  const sp = (await props.searchParams) as SearchParams;
  const q = sanitizeSearch(param(sp, "q"));
  const attendance = pickEnum(param(sp, "attendance"), ["not_checked_in", "present", "corrected"] as const);
  const role = pickEnum(param(sp, "role"), ["leader", "member"] as const);
  const page = parsePage(sp.page);

  const supabase = await createClient();
  let query = supabase.from("participant_overview").select("*", { count: "exact" });
  if (q) {
    const like = `%${q}%`;
    query = query.or([`full_name.ilike.${like}`, `email.ilike.${like}`, `participant_code.ilike.${like}`, `team_name.ilike.${like}`, `team_code.ilike.${like}`, `college.ilike.${like}`].join(","));
  }
  if (attendance) query = query.eq("attendance_state", attendance);
  if (role) query = query.eq("role", role);
  const { data, count, error } = await query.order("participant_code").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<ParticipantOverview[]>();

  return (
    <>
      <PageHeader title="Participants" description="Every registered participant across all teams." actions={<LinkButton href="/api/reports/participants" variant="secondary" prefetch={false}>Export CSV</LinkButton>} />
      <Card className="mb-4 p-4">
        <form className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]" role="search" aria-label="Filter participants">
          <label htmlFor="q" className="sr-only">Search</label>
          <input id="q" name="q" defaultValue={param(sp, "q")} placeholder="Name, email, participant ID, team…" className={inputClass} />
          <label htmlFor="f-att" className="sr-only">Attendance</label>
          <AutoSubmitSelect id="f-att" name="attendance" defaultValue={attendance ?? ""} className={inputClass}>
            <option value="">Attendance: all</option>
            <option value="not_checked_in">Not checked in</option>
            <option value="present">Present</option>
            <option value="corrected">Corrected</option>
          </AutoSubmitSelect>
          <label htmlFor="f-role" className="sr-only">Role</label>
          <AutoSubmitSelect id="f-role" name="role" defaultValue={role ?? ""} className={inputClass}>
            <option value="">Role: all</option>
            <option value="leader">Team leaders</option>
            <option value="member">Members</option>
          </AutoSubmitSelect>
          <button type="submit" className={buttonClass("primary")}>Search</button>
        </form>
      </Card>
      {error ? (
        <EmptyState title="Could not load participants">{error.message}</EmptyState>
      ) : !data?.length ? (
        <EmptyState title="No participants found" />
      ) : (
        <>
          <Table caption="Participants">
            <thead>
              <tr><Th>Participant ID</Th><Th>Name</Th><Th>Team</Th><Th>Role</Th><Th>Email</Th><Th>Phone</Th><Th>College</Th><Th>Attendance</Th></tr>
            </thead>
            <tbody className="divide-y divide-navy-800">
              {data.map((p) => (
                <tr key={p.id} className="hover:bg-navy-850/40">
                  <Td className="font-mono text-xs whitespace-nowrap">{p.participant_code}</Td>
                  <Td className="font-medium">{p.full_name}</Td>
                  <Td><Link className="text-blue-300 hover:underline" href={`/staff/teams/${p.team_id}`}>{p.team_name}</Link><div className="font-mono text-xs text-slate-400">{p.team_code}</div></Td>
                  <Td>{p.role === "leader" ? <Badge tone="violet">Leader</Badge> : "Member"}</Td>
                  <Td className="break-all">{p.email}</Td>
                  <Td className="whitespace-nowrap">{p.phone ?? "—"}</Td>
                  <Td>{p.college ?? "—"}</Td>
                  <Td><AttendanceBadge state={p.attendance_state} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(n) => hrefWith("/staff/participants", sp, { page: n })} />
        </>
      )}
    </>
  );
}
