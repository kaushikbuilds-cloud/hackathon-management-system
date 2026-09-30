import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Alert, Badge, Card, CardTitle, EmptyState, Flash, PageHeader, Stat, cx } from "@/components/ui";
import { Icon } from "@/components/icons";
import { can, requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { param, type SearchParams } from "@/lib/data/query";
import { MENTOR_TOPICS, minutesBetween, renderedAt } from "@/lib/mentors";
import { createServiceClient } from "@/lib/supabase/server";
import type { MentorRequest } from "@/lib/types";
import { mentorAction, setMentorDeskOpen } from "./actions";

export const metadata: Metadata = { title: "Mentor Desk" };

type Row = MentorRequest & { teams: { name: string; team_code: string } | null };

/** The live mentor queue: take the oldest request, help the team, mark it done. */
export default async function MentorDeskPage(props: PageProps<"/staff/mentors">) {
  const session = await requirePermission("mentor_teams");
  const sp = (await props.searchParams) as SearchParams;
  const service = createServiceClient();
  const now = renderedAt();
  const since = new Date(now - 24 * 3600 * 1000).toISOString();
  const [hackathon, { data: open }, { data: recent }] = await Promise.all([
    getHackathon(),
    service.from("mentor_requests").select("*, teams(name, team_code)").eq("hackathon_id", session.hackathonId)
      .in("status", ["waiting", "helping"]).order("created_at").returns<Row[]>(),
    service.from("mentor_requests").select("*, teams(name, team_code)").eq("hackathon_id", session.hackathonId)
      .eq("status", "done").gte("closed_at", since).order("closed_at", { ascending: false }).limit(50).returns<Row[]>(),
  ]);
  const mentorIds = [...new Set([...(open ?? []), ...(recent ?? [])].map((r) => r.mentor_id).filter((x): x is string => Boolean(x)))];
  const { data: mentors } = mentorIds.length
    ? await service.from("profiles").select("id, full_name, email").in("id", mentorIds).returns<{ id: string; full_name: string | null; email: string | null }[]>()
    : { data: [] };
  const nameOf = (id: string | null) => { const m = mentors?.find((x) => x.id === id); return m?.full_name || m?.email || "A mentor"; };

  const topic = (MENTOR_TOPICS as readonly string[]).includes(param(sp, "topic")) ? param(sp, "topic") : "";
  const waiting = (open ?? []).filter((r) => r.status === "waiting");
  const shown = waiting.filter((r) => !topic || r.topic === topic);
  const mine = (open ?? []).filter((r) => r.status === "helping" && r.mentor_id === session.userId);
  const others = (open ?? []).filter((r) => r.status === "helping" && r.mentor_id !== session.userId);
  const waits = (recent ?? []).filter((r) => r.claimed_at).map((r) => (new Date(r.claimed_at!).getTime() - new Date(r.created_at).getTime()) / 60000);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  const deskOpen = Boolean(hackathon?.mentor_desk_open);
  const canToggle = can(session, "manage_event");

  return (
    <>
      <PageHeader
        title="Mentor Desk"
        description="Teams ask for help from their portal. Take the oldest request, go to the team, and mark it done when you're finished."
        actions={<>
          <AutoRefresh seconds={10} />
          {canToggle && (
            <form action={setMentorDeskOpen.bind(null, !deskOpen)}>
              {deskOpen ? <ConfirmSubmit variant="secondary" message="Close the mentor desk? Teams won't be able to ask for help.">Close desk</ConfirmSubmit> : <SubmitButton>Open desk</SubmitButton>}
            </form>
          )}
        </>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      {!deskOpen && <div className="mb-6"><Alert tone="amber" title="The mentor desk is closed">{canToggle ? "Open it when mentors are ready; teams can then ask for help." : "Teams can't ask for help until the organisers open it."}</Alert></div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting" value={waiting.length} tone="amber" icon={<Icon name="history" className="size-5" />} hint={waiting[0] ? `Oldest waiting ${minutesBetween(waiting[0].created_at, now)}` : undefined} />
        <Stat label="Being helped" value={mine.length + others.length} tone="blue" icon={<Icon name="mentor" className="size-5" />} />
        <Stat label="Helped (24 h)" value={recent?.length ?? 0} tone="green" icon={<Icon name="check" className="size-5" />} />
        <Stat label="Average wait" value={avgWait === null ? "—" : `${avgWait} min`} tone="violet" icon={<Icon name="calendar" className="size-5" />} hint="Until a mentor took it (24 h)" />
      </div>

      {mine.length > 0 && (
        <section aria-labelledby="mine-heading" className="mb-6">
          <h2 id="mine-heading" className="mb-3 text-base font-semibold text-ink">You&apos;re helping</h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {mine.map((r) => (
              <li key={r.id}>
                <Card className="ring-2 ring-brand/30">
                  <RequestInfo r={r} now={now} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={mentorAction.bind(null, r.id, "done")}><SubmitButton size="sm">Done</SubmitButton></form>
                    <form action={mentorAction.bind(null, r.id, "release")}><SubmitButton size="sm" variant="secondary">Hand back to queue</SubmitButton></form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="mb-6">
        <CardTitle description="Oldest first. Taking one tells the team you're on the way.">Queue</CardTitle>
        <nav aria-label="Filter by topic" className="mb-4 flex flex-wrap gap-2">
          {["", ...MENTOR_TOPICS].map((t) => {
            const n = t ? waiting.filter((r) => r.topic === t).length : waiting.length;
            if (t && n === 0) return null;
            return (
              <Link key={t || "all"} href={t ? `?topic=${encodeURIComponent(t)}` : "?"} aria-current={topic === t ? "true" : undefined}
                className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium", topic === t ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-soft hover:text-ink")}>
                {t || "All topics"} <span className="tabular-nums opacity-80">{n}</span>
              </Link>
            );
          })}
        </nav>
        {shown.length === 0 ? <EmptyState title="No one is waiting">New requests appear here on their own.</EmptyState> : (
          <ol className="space-y-3">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-4">
                <div className="flex min-w-0 gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper-2 text-sm font-semibold text-ink-soft tabular-nums" aria-label={`Number ${waiting.indexOf(r) + 1} in the queue`}>{waiting.indexOf(r) + 1}</span>
                  <RequestInfo r={r} now={now} />
                </div>
                <form action={mentorAction.bind(null, r.id, "claim")}><SubmitButton size="sm">I&apos;m on it</SubmitButton></form>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {(others.length > 0 || (recent?.length ?? 0) > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>Other mentors are helping</CardTitle>
            {others.length === 0 ? <p className="text-sm text-muted">Nobody else right now.</p> : (
              <ul className="space-y-3 text-sm">
                {others.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span><span className="font-medium text-ink">{r.teams?.name}</span> <span className="text-muted">· {r.topic}</span></span>
                    <span className="text-xs text-muted">{nameOf(r.mentor_id)} · {minutesBetween(r.claimed_at ?? r.created_at, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Recently helped</CardTitle>
            {(recent?.length ?? 0) === 0 ? <p className="text-sm text-muted">No requests finished in the last 24 hours.</p> : (
              <ul className="space-y-3 text-sm">
                {recent!.slice(0, 10).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span><span className="font-medium text-ink">{r.teams?.name}</span> <span className="text-muted">· {r.topic}</span></span>
                    <span className="text-xs text-muted">{nameOf(r.mentor_id)} · {minutesBetween(r.closed_at!, now)} ago</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function RequestInfo({ r, now }: { r: Row; now: number }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">{r.teams?.name}</span>
        <span className="font-mono text-xs text-muted">{r.teams?.team_code}</span>
        <Badge tone="violet">{r.topic}</Badge>
      </p>
      <p className="mt-1 text-sm text-ink-soft">{r.details}</p>
      <p className="mt-1 text-xs text-muted">
        {r.location ? <><span className="font-medium text-ink-soft">{r.location}</span> · </> : null}
        {r.status === "helping" ? `taken ${minutesBetween(r.claimed_at ?? r.created_at, now)} ago` : `waiting ${minutesBetween(r.created_at, now)}`}
      </p>
    </div>
  );
}
