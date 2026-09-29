import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Alert, Badge, Card, CardTitle, Checkbox, EmptyState, Flash, PageHeader, SelectField, TextArea, TextField } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadStatements } from "@/lib/problem-statements";
import { createServiceClient } from "@/lib/supabase/server";
import type { ProblemStatement } from "@/lib/types";
import { deleteStatement, saveStatement, setSelectionOpen } from "./actions";

export const metadata: Metadata = { title: "Problem Statements" };

type Chooser = { id: string; name: string; team_code: string; problem_statement_id: string };

export default async function ProblemStatementsPage(props: PageProps<"/staff/problem-statements">) {
  const session = await requirePermission("manage_event", "view_participants");
  const sp = await props.searchParams;
  const canEdit = can(session, "manage_event");
  const [hackathon, statements, { data: choosers }] = await Promise.all([
    getHackathon(),
    loadStatements(session.hackathonId),
    createServiceClient().from("teams").select("id, name, team_code, problem_statement_id").eq("hackathon_id", session.hackathonId)
      .not("problem_statement_id", "is", null).neq("status", "rejected").order("team_code").returns<Chooser[]>(),
  ]);
  const teamsFor = (id: string) => (choosers ?? []).filter((t) => t.problem_statement_id === id);
  const tracks = hackathon?.tracks ?? [];
  const open = Boolean(hackathon?.ps_selection_open);
  const published = statements.filter((s) => s.is_published).length;

  return (
    <>
      <PageHeader
        title="Problem Statements"
        description="Publish the problems teams can work on. While selection is open, each team's leader picks one in the team portal."
        actions={canEdit ? (
          <form action={setSelectionOpen.bind(null, !open)}>
            {open ? <ConfirmSubmit variant="secondary" message="Close selection? Teams will no longer be able to change their choice.">Close selection</ConfirmSubmit>
              : <SubmitButton disabled={published === 0}>Open selection</SubmitButton>}
          </form>
        ) : undefined}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6">
        {open ? <Alert tone="green" title="Selection is open">Teams can choose or change their problem statement in the team portal.</Alert>
          : <Alert tone="blue" title="Selection is closed">{published ? "Open selection when teams should pick." : "Add and publish problem statements, then open selection."}</Alert>}
      </div>

      <div className={canEdit ? "grid gap-6 xl:grid-cols-[1fr_24rem]" : ""}>
        <div className="space-y-4">
          {statements.length === 0 ? <EmptyState title="No problem statements yet">{canEdit ? "Add your first one with the form." : "The organisers have not added any yet."}</EmptyState>
            : statements.map((s) => {
              const teams = teamsFor(s.id);
              const full = s.max_teams !== null && teams.length >= s.max_teams;
              return (
                <Card key={s.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone="violet">{s.code}</Badge>
                        <Badge tone={s.is_published ? "green" : "neutral"}>{s.is_published ? "Published" : "Draft"}</Badge>
                        {s.track && <Badge tone="blue">{s.track}</Badge>}
                      </p>
                      <h2 className="mt-2 text-base font-semibold text-ink">{s.title}</h2>
                    </div>
                    <p className="text-sm text-muted tabular-nums">
                      <span className="font-semibold text-ink">{teams.length}</span>{s.max_teams ? ` / ${s.max_teams}` : ""} teams{full && <Badge tone="amber" className="ml-2">Full</Badge>}
                    </p>
                  </div>
                  {s.description && <p className="mt-2 text-sm whitespace-pre-line text-ink-soft">{s.description}</p>}
                  {s.attachment_path && <p className="mt-2"><a href={`/api/problem-statements/${s.id}/file`} className="text-sm font-medium text-grass hover:underline">Download PDF</a></p>}
                  {teams.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-grass">Teams that chose it ({teams.length})</summary>
                      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                        {teams.map((t) => <li key={t.id}><Link href={`/staff/teams/${t.id}`} className="inline-flex rounded-full border border-line px-2.5 py-0.5 hover:border-brand/40">{t.name} <span className="ml-1 font-mono text-xs text-muted">{t.team_code}</span></Link></li>)}
                      </ul>
                    </details>
                  )}
                  {canEdit && (
                    <details className="mt-3 border-t border-line pt-3">
                      <summary className="cursor-pointer text-sm font-medium text-grass">Edit</summary>
                      <div className="mt-3"><StatementForm s={s} tracks={tracks} /></div>
                      <form action={deleteStatement.bind(null, s.id)} className="mt-3">
                        <ConfirmSubmit variant="danger" size="sm" message={`Delete ${s.code}? ${teams.length ? `${teams.length} team(s) chose it and will need to choose again.` : ""}`}>Delete</ConfirmSubmit>
                      </form>
                    </details>
                  )}
                </Card>
              );
            })}
        </div>
        {canEdit && (
          <Card className="h-fit">
            <CardTitle description="Codes (PS01, PS02, ...) are given automatically.">Add a problem statement</CardTitle>
            <StatementForm tracks={tracks} next={statements.length} />
          </Card>
        )}
      </div>
    </>
  );
}

function StatementForm({ s, tracks, next = 0 }: { s?: ProblemStatement; tracks: string[]; next?: number }) {
  const p = s ? `ps-${s.id}-` : "ps-new-";
  return (
    <form action={saveStatement} className="space-y-3">
      {s && <input type="hidden" name="id" value={s.id} />}
      <input type="hidden" name="sort_order" value={s?.sort_order ?? next + 1} />
      <TextField label="Title" name="title" id={`${p}title`} required maxLength={150} defaultValue={s?.title} placeholder="e.g. Smart waste collection for cities" />
      <TextArea label="Description" name="description" id={`${p}desc`} maxLength={5000} rows={5} defaultValue={s?.description ?? ""} hint="The problem, who it affects and what a good solution looks like." />
      {tracks.length > 0 && (
        <SelectField label="Track (optional)" name="track" id={`${p}track`} defaultValue={s?.track ?? ""} options={[{ value: "", label: "No track" }, ...tracks.map((t) => ({ value: t, label: t }))]} />
      )}
      <TextField label="Team limit (optional)" name="max_teams" id={`${p}max`} type="number" min={1} max={1000} defaultValue={s?.max_teams ?? ""} hint="Leave empty for no limit. When full, teams must choose another." />
      <div className="space-y-1.5">
        <label htmlFor={`${p}file`} className="block text-sm font-medium text-ink-soft">Attachment (optional PDF, up to 10 MB)</label>
        <input id={`${p}file`} name="attachment" type="file" accept="application/pdf" className="block text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink" />
        {s?.attachment_path && <Checkbox name="remove_attachment" label="Remove the current PDF" />}
      </div>
      <Checkbox name="is_published" label="Published (visible to teams and on the event page)" defaultChecked={s ? s.is_published : true} />
      <SubmitButton size="sm" variant={s ? "secondary" : "primary"}>{s ? "Save" : "Add problem statement"}</SubmitButton>
    </form>
  );
}
