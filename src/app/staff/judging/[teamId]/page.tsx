import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/client";
import { Alert, Card, CardTitle, DescriptionList, Flash, PageHeader, TextArea, TextField } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { UUID } from "@/lib/actions";
import { resolveCustomQuestions } from "@/lib/domain/registration";
import { judgingTeams, loadCriteria, maxTotal } from "@/lib/judging";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ProjectCard } from "@/components/project-card";
import type { JudgeScore, ProjectSubmission, RegistrationForm } from "@/lib/types";
import { submitScore } from "../actions";

export const metadata: Metadata = { title: "Score team" };

export default async function ScoreTeamPage(props: PageProps<"/staff/judging/[teamId]">) {
  const session = await requirePermission("judge_teams");
  const { teamId } = await props.params;
  if (!UUID.test(teamId)) notFound();
  const sp = await props.searchParams;
  const [hackathon, criteria, [team], { data: mine }] = await Promise.all([
    getHackathon(),
    loadCriteria(),
    judgingTeams(session.hackathonId, teamId),
    (await createClient()).from("judge_scores").select("*").eq("judge_id", session.userId).eq("team_id", teamId).maybeSingle<JudgeScore>(),
  ]);
  if (!team) notFound();
  const { data: form } = team.form_id
    ? await createServiceClient().from("registration_forms").select("custom_questions").eq("id", team.form_id).maybeSingle<Pick<RegistrationForm, "custom_questions">>()
    : { data: null };
  const { data: project } = await createServiceClient().from("project_submissions").select("*").eq("team_id", team.id).eq("hackathon_id", session.hackathonId).maybeSingle<ProjectSubmission>();
  const answers = resolveCustomQuestions(form?.custom_questions ?? []).map((q) => ({ label: q.label, value: team.custom_answers?.[q.id] || "—" }));
  const open = Boolean(hackathon?.judging_open);

  return (
    <>
      <PageHeader title={team.name} description={<span className="font-mono">{team.team_code}</span>} back={{ href: "/staff/judging", label: "All teams" }} />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Card>
          <CardTitle description={`Out of ${maxTotal(criteria)} points. ${mine ? "You have scored this team; saving again replaces your scores." : ""}`}>Your scores</CardTitle>
          {!open && <div className="mb-4"><Alert tone="amber" title="Judging is closed">Scores can&apos;t be saved until the organisers open judging.</Alert></div>}
          {criteria.length === 0 ? <p className="text-sm text-muted">No criteria are set up yet.</p> : (
            <form action={submitScore.bind(null, team.id)} className="space-y-6">
              {criteria.map((c) => {
                const current = mine?.scores?.[c.id];
                return (
                  <fieldset key={c.id} disabled={!open}>
                    <legend className="text-sm font-semibold text-ink">{c.name} <span className="font-normal text-muted">out of {c.max_points}</span></legend>
                    {c.description && <p className="mt-0.5 text-xs text-muted">{c.description}</p>}
                    {c.max_points <= 10 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from({ length: c.max_points + 1 }, (_, v) => (
                          <label key={v} className="relative">
                            <input type="radio" name={`c_${c.id}`} value={v} defaultChecked={current === v} required className="peer sr-only" aria-label={`${c.name}: ${v}`} />
                            <span className="grid size-11 cursor-pointer place-items-center rounded-md border border-line-strong bg-surface text-sm font-semibold text-ink-soft tabular-nums transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand hover:border-brand/50">{v}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <TextField label={`${c.name} score`} name={`c_${c.id}`} id={`c-${c.id}`} type="number" inputMode="numeric" min={0} max={c.max_points} step={1} required defaultValue={current ?? ""} className="mt-2 max-w-40" />
                    )}
                  </fieldset>
                );
              })}
              <TextArea label="Comment (optional, only organisers see it)" name="comment" id="comment" maxLength={1000} defaultValue={mine?.comment ?? ""} disabled={!open} />
              <SubmitButton disabled={!open}>{mine ? "Update score" : "Save score"}</SubmitButton>
            </form>
          )}
        </Card>
        <div className="order-first space-y-6 lg:order-none lg:col-start-2 lg:row-start-1">
        <ProjectCard project={project} tz={hackathon?.timezone} />
        <Card>
          <CardTitle>About the team</CardTitle>
          <DescriptionList items={[
            ...(team.track ? [{ label: "Track", value: team.track }] : []),
            { label: "College", value: team.college },
            ...answers,
          ]} />
        </Card>
        </div>
      </div>
    </>
  );
}
