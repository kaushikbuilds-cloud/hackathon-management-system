import type { Metadata } from "next";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Alert, Badge, Card, EmptyState, Flash, PageHeader, cx } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadMyTeam } from "@/lib/data/portal";
import { loadStatements, statementTaken } from "@/lib/problem-statements";
import { chooseStatement } from "./actions";

export const metadata: Metadata = { title: "Problem Statement" };

/** Published problem statements; the Team Leader (or team login) picks one while selection is open. */
export default async function PortalProblemStatementPage(props: PageProps<"/portal/problem-statement">) {
  const session = await requireParticipant();
  const sp = await props.searchParams;
  const [hackathon, data] = await Promise.all([getHackathon(), loadMyTeam(session.participantId, session.isTeamAccount)]);
  const hid = session.hackathonId ?? "";
  const [statements, taken] = await Promise.all([loadStatements(hid), statementTaken(hid)]);
  const published = statements.filter((s) => s.is_published);
  const mine = data?.team.problem_statement_id ?? null;
  const open = Boolean(hackathon?.ps_selection_open) && data?.team.status !== "rejected";
  const canChoose = open && Boolean(data?.isLeader);
  const chosen = published.find((s) => s.id === mine);

  return (
    <>
      <PageHeader title="Problem Statement" description="Read the problems and choose the one your team will solve." />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6">
        {chosen ? <Alert tone="green" title={`Your team chose ${chosen.code}: ${chosen.title}`}>{open ? "You can change it while selection is open." : "Selection is closed, so your choice is final."}</Alert>
          : open ? <Alert tone="blue" title="Choose your problem statement">{data?.isLeader ? "Pick one below. Some have a team limit, so choose early." : "Your Team Leader chooses for the team."}</Alert>
          : <Alert tone="amber" title="Selection is closed">{published.length ? "The organisers will open selection soon." : "The organisers will publish the problem statements soon."}</Alert>}
      </div>
      {published.length === 0 ? <EmptyState title="No problem statements yet">They will appear here when the organisers publish them.</EmptyState> : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {published.map((s) => {
            const count = taken.get(s.id) ?? 0;
            const isMine = s.id === mine;
            const full = s.max_teams !== null && count >= s.max_teams && !isMine;
            return (
              <li key={s.id}>
                <Card className={cx("flex h-full flex-col", isMine && "ring-2 ring-brand")}>
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone="violet">{s.code}</Badge>
                    {s.track && <Badge tone="blue">{s.track}</Badge>}
                    {isMine && <Badge tone="green">Your choice</Badge>}
                    {full && <Badge tone="amber">Full</Badge>}
                  </p>
                  <h2 className="mt-2 text-base font-semibold text-ink">{s.title}</h2>
                  {s.description && <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{s.description}</p>}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                    <span className="text-sm text-muted">
                      {s.max_teams ? `${Math.max(0, s.max_teams - count)} of ${s.max_teams} ${s.max_teams === 1 ? "place" : "places"} left` : `${count} ${count === 1 ? "team" : "teams"} chose this`}
                      {s.attachment_path && <> · <a href={`/api/problem-statements/${s.id}/file`} className="font-medium text-grass hover:underline">PDF</a></>}
                    </span>
                    {canChoose && (isMine
                      ? <form action={chooseStatement.bind(null, null)}><ConfirmSubmit variant="ghost" size="sm" message="Clear your team's choice?">Clear choice</ConfirmSubmit></form>
                      : <form action={chooseStatement.bind(null, s.id)}><SubmitButton size="sm" disabled={full}>{mine ? "Switch to this" : "Choose this"}</SubmitButton></form>)}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
