import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, EmptyState, Flash, LinkButton, PageHeader, cx, inputClass } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { param, type SearchParams } from "@/lib/data/query";
import { judgingTeams, loadCriteria, maxTotal } from "@/lib/judging";
import { createClient } from "@/lib/supabase/server";
import type { JudgeScore } from "@/lib/types";

export const metadata: Metadata = { title: "Judging" };

/** A judge's list of approved teams, with their own score for each. */
export default async function JudgingPage(props: PageProps<"/staff/judging">) {
  const session = await requirePermission("judge_teams", "manage_judging");
  const sp = (await props.searchParams) as SearchParams;
  const isJudge = can(session, "judge_teams");
  const [hackathon, criteria, teams, { data: mine }] = await Promise.all([
    getHackathon(),
    loadCriteria(),
    judgingTeams(session.hackathonId),
    (await createClient()).from("judge_scores").select("*").eq("judge_id", session.userId).returns<JudgeScore[]>(),
  ]);
  const myScore = new Map((mine ?? []).map((s) => [s.team_id, s]));
  const total = (s: JudgeScore) => criteria.reduce((n, c) => n + (Number(s.scores[c.id]) || 0), 0);
  const q = param(sp, "q").trim().toLowerCase().slice(0, 80);
  const track = param(sp, "track");
  const todo = param(sp, "show") === "todo";
  const shown = teams.filter((t) =>
    (!q || `${t.name} ${t.team_code} ${t.college ?? ""}`.toLowerCase().includes(q)) &&
    (!track || t.track === track) &&
    (!todo || !myScore.has(t.id)));
  const done = teams.filter((t) => myScore.has(t.id)).length;
  const tracks = hackathon?.tracks ?? [];
  const open = Boolean(hackathon?.judging_open);

  return (
    <>
      <PageHeader
        title="Judging"
        description={isJudge ? "Score each team on every criterion. You can change your scores until judging closes. Other judges' scores stay hidden." : "Judges score teams here."}
        actions={can(session, "manage_judging") ? <LinkButton href="/staff/judging/results" variant="secondary">Results & setup</LinkButton> : undefined}
      />
      <Flash notice={sp.notice} error={sp.error} />
      {!isJudge ? (
        <Alert tone="blue" title="You're not a judge">Ask an Admin to give you the “Judge: score teams” permission, or open Results & setup to manage judging.</Alert>
      ) : criteria.length === 0 ? (
        <EmptyState title="No judging criteria yet">The organisers will add the criteria (for example Innovation, Technical, Presentation) before judging starts.</EmptyState>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card className="p-4"><p className="text-sm text-muted">Scored by you</p><p className="mt-1 text-2xl font-semibold tabular-nums">{done} <span className="text-base font-normal text-muted">of {teams.length}</span></p>
              <div className="mt-2 h-2 rounded-full bg-paper-2" aria-hidden="true"><div className="h-full rounded-full bg-brand" style={{ width: `${teams.length ? (done / teams.length) * 100 : 0}%` }} /></div></Card>
            <Card className="p-4"><p className="text-sm text-muted">Criteria</p><p className="mt-1 text-sm text-ink">{criteria.map((c) => `${c.name} /${c.max_points}`).join(" · ")}</p><p className="mt-1 text-xs text-muted">Out of {maxTotal(criteria)} points</p></Card>
            <Card className="p-4"><p className="text-sm text-muted">Judging</p><p className="mt-1"><Badge tone={open ? "green" : "neutral"}>{open ? "Open" : "Closed"}</Badge></p><p className="mt-1 text-xs text-muted">{open ? "Scores can be saved." : "Scores are locked until the organisers open judging."}</p></Card>
          </div>

          <form className="mb-4 flex flex-wrap gap-2" role="search" aria-label="Find a team">
            <label className="sr-only" htmlFor="jq">Search teams</label>
            <input id="jq" name="q" defaultValue={param(sp, "q")} placeholder="Search team, Team ID or college" className={cx(inputClass, "max-w-xs")} />
            {tracks.length > 0 && (
              <>
                <label className="sr-only" htmlFor="jtrack">Track</label>
                <select id="jtrack" name="track" defaultValue={track} className={cx(inputClass, "max-w-48")}>
                  <option value="">All tracks</option>
                  {tracks.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink-soft"><input type="checkbox" name="show" value="todo" defaultChecked={todo} className="size-4 accent-brand" /> Not scored yet</label>
            <button type="submit" className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover">Show</button>
          </form>

          {shown.length === 0 ? <EmptyState title={teams.length ? "No teams match" : "No approved teams yet"}>{teams.length ? "Try another search." : "Teams appear here once they are approved."}</EmptyState> : (
            <ul className="space-y-2">
              {shown.map((t) => {
                const s = myScore.get(t.id);
                return (
                  <li key={t.id}>
                    <Link href={`/staff/judging/${t.id}`} className="panel flex min-h-16 items-center gap-4 rounded-lg border border-line px-4 py-3 transition-colors hover:border-brand/40">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{t.name}</span>
                        <span className="block text-xs text-muted"><span className="font-mono">{t.team_code}</span>{t.track ? ` · ${t.track}` : ""}{t.college ? ` · ${t.college}` : ""}</span>
                      </span>
                      {s ? <Badge tone="green">{total(s)} / {maxTotal(criteria)}</Badge> : <Badge tone="amber">Not scored</Badge>}
                      <Icon name="arrowRight" className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
