import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, AutoSubmitSelect } from "@/components/client";
import { AttendanceBadge, PaymentBadge, PdfBadge, RegistrationBadge, TeamAttendance } from "@/components/status";
import { Badge, Card, EmptyState, Flash, LinkButton, PageHeader, Pagination, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { hrefWith, param, type SearchParams } from "@/lib/data/query";
import { pickEnum, parsePage, sanitizeSearch } from "@/lib/domain/search";
import { createClient } from "@/lib/supabase/server";
import type { ParticipantOverview, TeamOverview } from "@/lib/types";

export const metadata: Metadata = { title: "Teams" };

const PAGE_SIZE = 20;
const SORTS = ["name", "team_code", "created_at", "member_count", "college", "leader_name"] as const;

export default async function TeamsPage(props: PageProps<"/staff/teams">) {
  const session = await requirePermission("view_participants", "edit_registrations", "manage_registrations");
  const sp = (await props.searchParams) as SearchParams;
  const supabase = await createClient();

  const q = sanitizeSearch(param(sp, "q"));
  const status = pickEnum(param(sp, "status"), ["pending", "approved", "rejected", "flagged"] as const);
  const pdf = pickEnum(param(sp, "pdf"), ["not_generated", "generated", "outdated", "failed"] as const);
  const attendance = pickEnum(param(sp, "attendance"), ["none", "partial", "full"] as const);
  const payment = pickEnum(param(sp, "payment"), ["not_required", "submitted", "verified", "rejected"] as const);
  const college = param(sp, "college").slice(0, 150);
  const sort = pickEnum(param(sp, "sort"), SORTS) ?? "created_at";
  const dir = param(sp, "dir") === "asc" ? "asc" : param(sp, "dir") === "desc" ? "desc" : sort === "created_at" ? "desc" : "asc";
  const page = parsePage(sp.page);
  const expand = param(sp, "expand");

  let query = supabase.from("team_overview").select("*", { count: "exact" });
  if (q) {
    const like = `%${q}%`;
    query = query.or(
      [`name.ilike.${like}`, `team_code.ilike.${like}`, `leader_name.ilike.${like}`, `college.ilike.${like}`, `member_search.ilike.${like}`].join(","),
    );
  }
  if (status) query = query.eq("status", status);
  if (pdf) query = query.eq("pdf_status", pdf);
  if (attendance) query = query.eq("attendance_state", attendance);
  if (payment) query = query.eq("payment_status", payment);
  if (college) query = query.eq("college", college);
  query = query.order(sort, { ascending: dir === "asc" }).order("team_code").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data: teams, count, error }, { data: collegeRows }] = await Promise.all([
    query.returns<TeamOverview[]>(),
    supabase.from("teams").select("college").not("college", "is", null).order("college").returns<{ college: string }[]>(),
  ]);
  const colleges = [...new Set((collegeRows ?? []).map((r) => r.college))];

  const expandedMembers = expand && teams?.some((t) => t.id === expand)
    ? (await supabase.from("participant_overview").select("*").eq("team_id", expand).order("role").order("participant_code").returns<ParticipantOverview[]>()).data ?? []
    : [];

  const canPdf = can(session, "generate_pdf");
  const sortHref = (key: (typeof SORTS)[number]) =>
    hrefWith("/staff/teams", sp, { sort: key, dir: sort === key && dir === "asc" ? "desc" : "asc", page: null });
  const sortLabel = (key: (typeof SORTS)[number], label: string) => (
    <Link href={sortHref(key)} className="inline-flex items-center gap-1 hover:text-ink" aria-label={`Sort by ${label}`}>
      {label}
      {sort === key && <span aria-hidden="true">{dir === "asc" ? "▲" : "▼"}</span>}
    </Link>
  );
  const hasFilters = Boolean(q || status || pdf || attendance || college || payment);

  return (
    <>
      <PageHeader
        title="Teams"
        description="One row per team. New registrations appear automatically. Click a team name for full details."
        actions={<><AutoRefresh /><LinkButton href="/api/reports/teams" variant="secondary" prefetch={false}>Export CSV</LinkButton></>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <Card className="mb-4 p-4">
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-[2fr_repeat(5,1fr)_auto]" role="search" aria-label="Filter teams">
          <label className="sr-only" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={param(sp, "q")} placeholder="Search team, Team ID, leader, college, participant ID…" className={inputClass} />
          <FilterSelect name="status" label="Status" value={status} options={[["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["flagged", "Flagged"]]} />
          <FilterSelect name="college" label="College" value={college} options={colleges.map((c) => [c, c])} />
          <FilterSelect name="attendance" label="Attendance" value={attendance} options={[["none", "None present"], ["partial", "Partially present"], ["full", "All present"]]} />
          <FilterSelect name="payment" label="Payment" value={payment} options={[["submitted", "To verify"], ["verified", "Paid"], ["rejected", "Rejected"], ["not_required", "No fee"]]} />
          <FilterSelect name="pdf" label="PDF" value={pdf} options={[["not_generated", "Not generated"], ["generated", "Generated"], ["outdated", "Outdated"], ["failed", "Failed"]]} />
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary")}>Search</button>
            {hasFilters && <Link href="/staff/teams" className={buttonClass("ghost")}>Reset</Link>}
          </div>
        </form>
      </Card>

      {error ? (
        <EmptyState title="Could not load teams">{error.message}</EmptyState>
      ) : !teams?.length ? (
        <EmptyState title={hasFilters ? "No teams match these filters" : "No teams registered yet"}>
          {hasFilters ? "Try a different search or reset the filters." : "Teams appear here as soon as registrations are submitted."}
        </EmptyState>
      ) : (
        <>
          <Table caption="Registered teams">
            <thead>
              <tr>
                <Th className="w-8"><span className="sr-only">Expand</span></Th>
                <Th>{sortLabel("name", "Team Name")}</Th>
                <Th>{sortLabel("team_code", "Team ID")}</Th>
                <Th>{sortLabel("leader_name", "Team Leader")}</Th>
                <Th>{sortLabel("member_count", "Members")}</Th>
                <Th>{sortLabel("college", "College")}</Th>
                <Th>Registration</Th>
                <Th>Payment</Th>
                <Th>Attendance</Th>
                <Th>ID Card PDF</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {teams.map((t) => {
                const open = expand === t.id;
                return (
                  <TeamRows key={t.id} team={t} open={open} members={open ? expandedMembers : []} canPdf={canPdf}
                    toggleHref={hrefWith("/staff/teams", sp, { expand: open ? null : t.id })} />
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(p) => hrefWith("/staff/teams", sp, { page: p })} />
        </>
      )}
    </>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: string[][] }) {
  return (
    <>
      <label className="sr-only" htmlFor={`f-${name}`}>{label}</label>
      <AutoSubmitSelect id={`f-${name}`} name={name} defaultValue={value ?? ""} className={inputClass}>
        <option value="">{label}: all</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </AutoSubmitSelect>
    </>
  );
}

function TeamRows({ team: t, open, members, canPdf, toggleHref }: { team: TeamOverview; open: boolean; members: ParticipantOverview[]; canPdf: boolean; toggleHref: string }) {
  return (
    <>
      <tr className={open ? "bg-paper" : "hover:bg-paper"}>
        <Td>
          <Link href={toggleHref} scroll={false} aria-expanded={open} aria-controls={`members-${t.id}`} aria-label={`${open ? "Collapse" : "Expand"} members of ${t.name}`}
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-paper hover:text-ink">
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          </Link>
        </Td>
        <Td className="min-w-40 font-semibold">
          <Link href={`/staff/teams/${t.id}`} className="text-brand hover:text-brand hover:underline">{t.name}</Link>
        </Td>
        <Td className="font-mono text-xs whitespace-nowrap">{t.team_code}</Td>
        <Td className="min-w-32">{t.leader_name ?? "—"}</Td>
        <Td className="tabular-nums">{t.member_count}</Td>
        <Td className="max-w-48 truncate" title={t.college ?? ""}>{t.college ?? "—"}</Td>
        <Td><RegistrationBadge status={t.status} /></Td>
        <Td><PaymentBadge status={t.payment_status ?? "not_required"} /></Td>
        <Td><TeamAttendance state={t.attendance_state} present={t.present_count} total={t.member_count} /></Td>
        <Td>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <PdfBadge status={t.pdf_status} />
            {canPdf && (
              <Link href={`/staff/teams/${t.id}/id-cards`} className={buttonClass(t.pdf_status === "generated" ? "secondary" : "primary", "sm")}
                aria-label={`${t.pdf_status === "generated" ? "Regenerate" : "Generate"} ID card PDF for ${t.name}`}>
                {t.pdf_status === "generated" ? "Regenerate" : t.pdf_status === "failed" ? "Retry PDF" : "Generate PDF"}
              </Link>
            )}
            {canPdf && (t.pdf_status === "generated" || t.pdf_status === "outdated") && (
              <a href={`/api/teams/${t.id}/id-cards/latest`} className={buttonClass("ghost", "sm")} aria-label={`Download latest ID card PDF for ${t.name}`}>
                Download
              </a>
            )}
          </div>
        </Td>
      </tr>
      {open && (
        <tr id={`members-${t.id}`} className="bg-paper">
          <td colSpan={10} className="px-3 pb-4">
            {members.length === 0 ? (
              <p className="py-3 text-sm text-muted">No members.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border-2 border-line">
                <table className="min-w-full text-sm">
                  <caption className="sr-only">Members of {t.name}</caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="px-3 py-2">Participant ID</th>
                      <th scope="col" className="px-3 py-2">Name</th>
                      <th scope="col" className="px-3 py-2">Role</th>
                      <th scope="col" className="px-3 py-2">Email</th>
                      <th scope="col" className="px-3 py-2">Phone</th>
                      <th scope="col" className="px-3 py-2">Department</th>
                      <th scope="col" className="px-3 py-2">Year</th>
                      <th scope="col" className="px-3 py-2">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2 font-mono text-xs">{m.participant_code}</td>
                        <td className="px-3 py-2">{m.full_name}</td>
                        <td className="px-3 py-2">{m.role === "leader" ? <Badge tone="violet">Leader</Badge> : "Member"}</td>
                        <td className="px-3 py-2">{m.email}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{m.phone ?? "—"}</td>
                        <td className="px-3 py-2">{m.department ?? "—"}</td>
                        <td className="px-3 py-2">{m.academic_year ?? "—"}</td>
                        <td className="px-3 py-2"><AttendanceBadge state={m.attendance_state} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
