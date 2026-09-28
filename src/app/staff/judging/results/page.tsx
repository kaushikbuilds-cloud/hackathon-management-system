import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Alert, Badge, Card, CardTitle, EmptyState, Flash, LinkButton, PageHeader, Table, Td, Th, TextField, cx, inputClass } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { param, type SearchParams } from "@/lib/data/query";
import { loadCriteria, maxTotal } from "@/lib/judging";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { JudgingCriterion, LeaderboardRow } from "@/lib/types";
import { deleteCriterion, saveCriterion, setAward, setJudgingOpen } from "../actions";

export const metadata: Metadata = { title: "Judging Results" };

const AWARDS = ["Winner", "1st Runner-up", "2nd Runner-up", "Best Design", "Most Innovative", "Special Mention"];

export default async function JudgingResultsPage(props: PageProps<"/staff/judging/results">) {
  const session = await requirePermission("manage_judging");
  const sp = (await props.searchParams) as SearchParams;
  const supabase = await createClient();
  const [hackathon, criteria, boardResult, { data: scoreRows }, { data: judgeRows }] = await Promise.all([
    getHackathon(),
    loadCriteria(),
    supabase.rpc("judging_leaderboard"),
    supabase.from("judge_scores").select("judge_id").returns<{ judge_id: string }[]>(),
    createServiceClient().from("staff_permissions").select("profile_id, profiles!staff_permissions_profile_id_fkey!inner(full_name, email, hackathon_id, status)")
      .eq("permission", "judge_teams").eq("profiles.hackathon_id", session.hackathonId)
      .returns<{ profile_id: string; profiles: { full_name: string | null; email: string | null; status: string } }[]>(),
  ]);
  const board = boardResult.data as LeaderboardRow[] | null;
  const tracks = hackathon?.tracks ?? [];
  const track = tracks.includes(param(sp, "track")) ? param(sp, "track") : "";
  const rows = (board ?? []).filter((r) => !track || r.track === track);
  const scoredCount = new Map<string, number>();
  for (const s of scoreRows ?? []) scoredCount.set(s.judge_id, (scoredCount.get(s.judge_id) ?? 0) + 1);
  const teamCount = (board ?? []).length;
  const open = Boolean(hackathon?.judging_open);
  const top = maxTotal(criteria);
  let rank = 0;

  return (
    <>
      <PageHeader
        title="Judging Results"
        description="Set the criteria, open judging when judges are ready, then rank teams by their average score and give awards. Awards become certificates of achievement."
        back={{ href: "/staff/judging", label: "Judging" }}
        actions={<>
          <LinkButton href="/api/reports/judging" variant="secondary" prefetch={false}>Export CSV</LinkButton>
          <form action={setJudgingOpen.bind(null, !open)}>
            {open
              ? <ConfirmSubmit variant="danger" message="Close judging? Judges will no longer be able to change scores.">Close judging</ConfirmSubmit>
              : <SubmitButton disabled={criteria.length === 0}>Open judging</SubmitButton>}
          </form>
        </>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6">
        {open
          ? <Alert tone="green" title="Judging is open">Judges can score teams and change their scores.</Alert>
          : <Alert tone="blue" title="Judging is closed">{criteria.length ? "Open judging when your judges are ready. Scores are locked while it's closed." : "Add at least one criterion, then open judging."}</Alert>}
      </div>

      <div className="flex flex-col gap-6">
      <div className={cx("grid gap-6 lg:grid-cols-2", criteria.length ? "order-2" : "order-1")}>
          <Card>
            <CardTitle description="What judges score, and the maximum points for each.">Criteria</CardTitle>
            {criteria.length > 0 && (
              <ul className="mb-4 divide-y divide-line-soft rounded-md border border-line">
                {criteria.map((c) => (
                  <li key={c.id} className="p-3">
                    <p className="flex justify-between gap-2 text-sm"><span className="font-semibold text-ink">{c.name}</span><Badge tone="violet">/{c.max_points}</Badge></p>
                    {c.description && <p className="text-xs text-muted">{c.description}</p>}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-grass">Edit</summary>
                      <div className="mt-2"><CriterionForm c={c} /></div>
                      <form action={deleteCriterion.bind(null, c.id)} className="mt-2">
                        <ConfirmSubmit variant="danger" size="sm" message={`Remove ${c.name}? Scores already given for it will no longer count.`}>Remove</ConfirmSubmit>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            <details open={criteria.length === 0}>
              <summary className="cursor-pointer text-sm font-semibold text-grass">Add a criterion</summary>
              <div className="mt-3"><CriterionForm next={criteria.length} /></div>
            </details>
          </Card>

          <Card>
            <CardTitle description="Officials with the “Judge: score teams” permission. Add judges from Officials Management.">Judges</CardTitle>
            {!judgeRows?.length ? <p className="text-sm text-muted">No judges yet.</p> : (
              <ul className="space-y-3">
                {judgeRows.map((j) => {
                  const n = scoredCount.get(j.profile_id) ?? 0;
                  return (
                    <li key={j.profile_id}>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate text-ink">{j.profiles.full_name || j.profiles.email}</span>
                        <span className="shrink-0 tabular-nums text-muted">{n} / {teamCount}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-paper-2" aria-hidden="true"><div className="h-full rounded-full bg-brand" style={{ width: `${teamCount ? (n / teamCount) * 100 : 0}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
      </div>

      <Card className={criteria.length ? "order-1" : "order-2"}>
          <CardTitle description={teamCount ? `${teamCount} approved teams${criteria.length ? `, scored out of ${top}` : ""}. The score is the average of all judges who scored the team.` : undefined}>Leaderboard</CardTitle>
          {tracks.length > 0 && (
            <nav aria-label="Leaderboard by track" className="mb-4 flex flex-wrap gap-2">
              {["", ...tracks].map((t) => (
                <Link key={t || "all"} href={t ? `?track=${encodeURIComponent(t)}` : "?"} aria-current={track === t ? "true" : undefined}
                  className={cx("inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium", track === t ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-soft hover:text-ink")}>
                  {t || "Overall"}
                </Link>
              ))}
            </nav>
          )}
          {rows.length === 0 ? <EmptyState title="No approved teams yet">Teams appear here once they are approved.</EmptyState> : (
            <Table caption="Teams ranked by average judging score">
              <thead>
                <tr>
                  <Th>#</Th><Th>Team</Th>{tracks.length > 0 && !track && <Th>Track</Th>}<Th>Judges</Th><Th>Score</Th>
                  {criteria.map((c) => <Th key={c.id} title={`Average out of ${c.max_points}`}>{c.name}</Th>)}
                  <Th>Award</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const scored = r.avg_total !== null;
                  if (scored) rank++;
                  return (
                    <tr key={r.team_id}>
                      <Td className="font-semibold tabular-nums">{scored ? rank : "—"}</Td>
                      <Td><Link href={`/staff/teams/${r.team_id}`} className="font-semibold text-grass hover:underline">{r.team_name}</Link><span className="block font-mono text-xs text-muted">{r.team_code}</span></Td>
                      {tracks.length > 0 && !track && <Td className="whitespace-nowrap">{r.track ?? "—"}</Td>}
                      <Td className="tabular-nums">{r.judges}</Td>
                      <Td className="whitespace-nowrap font-semibold tabular-nums">{scored ? `${Number(r.avg_total)} / ${top}` : <span className="font-normal text-muted">Not scored</span>}</Td>
                      {criteria.map((c) => <Td key={c.id} className="tabular-nums text-ink-soft">{r.criteria?.[c.id] !== undefined ? Number(r.criteria[c.id]) : "—"}</Td>)}
                      <Td>
                        <form action={setAward.bind(null, r.team_id)} className="flex items-center gap-1.5">
                          <label className="sr-only" htmlFor={`award-${r.team_id}`}>Award for {r.team_name}</label>
                          <input id={`award-${r.team_id}`} name="award" list="award-options" defaultValue={r.award ?? ""} maxLength={60} placeholder="e.g. Winner" className={cx(inputClass, "min-h-9 w-40 py-1")} />
                          <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                        </form>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <datalist id="award-options">
            {[...AWARDS, ...tracks.map((t) => `Best in ${t}`)].map((a) => <option key={a} value={a} />)}
          </datalist>
        </Card>

      </div>
    </>
  );
}

function CriterionForm({ c, next = 0 }: { c?: JudgingCriterion; next?: number }) {
  const p = c ? `cr-${c.id}-` : "cr-new-";
  return (
    <form action={saveCriterion} className="space-y-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="sort_order" value={c?.sort_order ?? next + 1} />
      <TextField label="Name" name="name" id={`${p}name`} required maxLength={60} defaultValue={c?.name} placeholder="e.g. Innovation" />
      <TextField label="Maximum points" name="max_points" id={`${p}max`} type="number" min={1} max={100} required defaultValue={c?.max_points ?? 10} />
      <TextField label="What to look for (optional)" name="description" id={`${p}desc`} maxLength={200} defaultValue={c?.description ?? ""} />
      <SubmitButton size="sm" variant={c ? "secondary" : "primary"}>{c ? "Save" : "Add criterion"}</SubmitButton>
    </form>
  );
}
