import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, Checkbox, EmptyState, Flash, LinkButton, PageHeader, Stat, Table, Td, TextField, Th, cx, inputClass } from "@/components/ui";
import { Icon } from "@/components/icons";
import { can, canAny, requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { param, type SearchParams } from "@/lib/data/query";
import { formatDateTime, toLocalInput } from "@/lib/format";
import { judgingTeams } from "@/lib/judging";
import { projectsOpen, repoLabel } from "@/lib/projects";
import { createServiceClient } from "@/lib/supabase/server";
import type { ProjectSubmission } from "@/lib/types";
import { saveProjectSettings } from "./actions";

export const metadata: Metadata = { title: "Projects" };

/** Every approved team's project submission, with the submission settings. */
export default async function ProjectsPage(props: PageProps<"/staff/projects">) {
  const session = await requirePermission("view_participants", "manage_judging", "judge_teams", "manage_event");
  const sp = (await props.searchParams) as SearchParams;
  const [hackathon, teams, { data: projects }] = await Promise.all([
    getHackathon(),
    judgingTeams(session.hackathonId),
    createServiceClient().from("project_submissions").select("*").eq("hackathon_id", session.hackathonId).returns<ProjectSubmission[]>(),
  ]);
  const byTeam = new Map((projects ?? []).map((p) => [p.team_id, p]));
  const tz = hackathon?.timezone ?? "UTC";
  const tracks = hackathon?.tracks ?? [];
  const q = param(sp, "q").trim().toLowerCase().slice(0, 80);
  const track = tracks.includes(param(sp, "track")) ? param(sp, "track") : "";
  const show = param(sp, "show");
  const rows = teams.filter((t) => {
    const p = byTeam.get(t.id);
    return (!q || `${t.name} ${t.team_code} ${t.college ?? ""} ${p?.title ?? ""}`.toLowerCase().includes(q))
      && (!track || t.track === track)
      && (show !== "submitted" || p) && (show !== "missing" || !p);
  });
  const submitted = teams.filter((t) => byTeam.has(t.id)).length;
  const canSettings = canAny(session, ["manage_event", "manage_judging"]);
  const open = projectsOpen(hackathon);

  return (
    <>
      <PageHeader
        title="Projects"
        description="What each approved team built: repository, demo, video and slides. Judges see the same on their scoring screen."
        actions={can(session, "view_reports") ? <LinkButton href="/api/reports/projects" variant="secondary" prefetch={false}>Export CSV</LinkButton> : undefined}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Submitted" value={`${submitted} / ${teams.length}`} tone="green" icon={<Icon name="check" className="size-5" />} hint={teams.length ? `${Math.round((submitted / teams.length) * 100)}% of approved teams` : undefined} />
        <Stat label="Not submitted yet" value={teams.length - submitted} tone="amber" icon={<Icon name="history" className="size-5" />} />
        <Stat label="Submissions" value={open ? "Open" : "Closed"} tone="violet" icon={<Icon name="calendar" className="size-5" />}
          hint={hackathon?.projects_deadline ? `Deadline ${formatDateTime(hackathon.projects_deadline, tz)}` : "No deadline set"} />
      </div>

      <div className={cx("grid gap-6", canSettings && "xl:grid-cols-[1fr_20rem]")}>
        <Card>
          <form className="mb-4 flex flex-wrap gap-2" role="search" aria-label="Filter projects">
            <label className="sr-only" htmlFor="pq">Search</label>
            <input id="pq" name="q" defaultValue={param(sp, "q")} placeholder="Team, Team ID, college or project" className={cx(inputClass, "max-w-xs")} />
            {tracks.length > 0 && (
              <>
                <label className="sr-only" htmlFor="ptrack">Track</label>
                <select id="ptrack" name="track" defaultValue={track} className={cx(inputClass, "max-w-48")}>
                  <option value="">All tracks</option>
                  {tracks.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}
            <label className="sr-only" htmlFor="pshow">Status</label>
            <select id="pshow" name="show" defaultValue={show} className={cx(inputClass, "max-w-48")}>
              <option value="">All teams</option>
              <option value="submitted">Submitted</option>
              <option value="missing">Not submitted</option>
            </select>
            <button type="submit" className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover">Show</button>
          </form>
          {rows.length === 0 ? <EmptyState title={teams.length ? "No teams match" : "No approved teams yet"}>{teams.length ? "Try another filter." : "Teams appear here once they are approved."}</EmptyState> : (
            <Table caption="Project submissions">
              <thead><tr><Th>Team</Th>{tracks.length > 0 && <Th>Track</Th>}<Th>Project</Th><Th>Links</Th><Th>Updated</Th></tr></thead>
              <tbody>
                {rows.map((t) => {
                  const p = byTeam.get(t.id);
                  return (
                    <tr key={t.id}>
                      <Td>
                        {can(session, "view_participants") ? <Link href={`/staff/teams/${t.id}`} className="font-semibold text-grass hover:underline">{t.name}</Link> : <span className="font-semibold">{t.name}</span>}
                        <span className="block font-mono text-xs text-muted">{t.team_code}</span>
                      </Td>
                      {tracks.length > 0 && <Td className="whitespace-nowrap">{t.track ?? "—"}</Td>}
                      <Td className="max-w-md">{p ? <><span className="font-medium text-ink">{p.title}</span><span className="line-clamp-2 block text-xs text-muted">{p.description}</span></> : <Badge tone="amber">Not submitted</Badge>}</Td>
                      <Td>
                        {p && (
                          <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                            <a href={p.repo_url} target="_blank" rel="noreferrer" className="font-medium text-grass hover:underline" title={repoLabel(p.repo_url)}>Code</a>
                            {p.demo_url && <a href={p.demo_url} target="_blank" rel="noreferrer" className="text-grass hover:underline">Demo</a>}
                            {p.video_url && <a href={p.video_url} target="_blank" rel="noreferrer" className="text-grass hover:underline">Video</a>}
                            {p.slides_path && <a href={`/api/projects/${t.id}/slides`} className="text-grass hover:underline">Slides</a>}
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-soft">{p ? formatDateTime(p.updated_at, tz) : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {canSettings && (
          <Card>
            <CardTitle description="Teams submit from the Project page in their portal.">Submission settings</CardTitle>
            <form action={saveProjectSettings} className="space-y-4">
              <Checkbox name="open" label="Accept project submissions" defaultChecked={Boolean(hackathon?.projects_open)} hint="Teams can submit and edit while this is on." />
              <TextField label="Deadline (optional)" name="deadline" id="projects-deadline" type="datetime-local" defaultValue={toLocalInput(hackathon?.projects_deadline, tz)}
                hint={`In ${tz}. After this, projects are locked even if submissions are on.`} />
              <SubmitButton>Save settings</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
