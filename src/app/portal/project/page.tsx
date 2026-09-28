import type { Metadata } from "next";
import { Alert, Badge, Card, CardTitle, DescriptionList, PageHeader } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadMyTeam } from "@/lib/data/portal";
import { formatDateTime } from "@/lib/format";
import { projectsOpen, repoLabel } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import type { ProjectSubmission } from "@/lib/types";
import { ProjectForm } from "./project-form";

export const metadata: Metadata = { title: "Project" };

/** The team submits the work it built: repository, demo, video and slides. */
export default async function PortalProjectPage() {
  const session = await requireParticipant();
  const [hackathon, data] = await Promise.all([getHackathon(), loadMyTeam(session.participantId, session.isTeamAccount)]);
  const { data: project } = data
    ? await (await createClient()).from("project_submissions").select("*").eq("team_id", data.team.id).maybeSingle<ProjectSubmission>()
    : { data: null };
  const tz = hackathon?.timezone ?? "UTC";
  const open = projectsOpen(hackathon);
  const deadline = hackathon?.projects_deadline ? formatDateTime(hackathon.projects_deadline, tz) : null;
  const approved = data?.team.status === "approved";

  return (
    <>
      <PageHeader title="Project" description="Share what your team built. Judges see your project with its links and slides." />
      <div className="mb-6">
        {!approved ? <Alert tone="amber" title="Waiting for approval">Your team can submit a project once the organisers approve your registration.</Alert>
          : open ? <Alert tone="blue" title="Submissions are open">{deadline ? `Submit or edit until ${deadline}.` : "Submit or edit until the organisers close submissions."}</Alert>
          : <Alert tone="amber" title="Submissions are closed">{project ? "Your project is saved; it can no longer be changed." : "The organisers will open project submissions during the event."}</Alert>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardTitle actions={project ? <Badge tone="green">Submitted</Badge> : <Badge tone="amber">Not submitted</Badge>}>Your project</CardTitle>
          {approved && open && data?.isLeader ? <ProjectForm project={project} hasSlides={Boolean(project?.slides_path)} />
            : project ? (
              <DescriptionList items={[
                { label: "Project name", value: project.title },
                { label: "Repository", value: <a href={project.repo_url} target="_blank" rel="noreferrer" className="font-medium text-grass hover:underline">{repoLabel(project.repo_url)}</a> },
                { label: "Live demo", value: project.demo_url ? <a href={project.demo_url} target="_blank" rel="noreferrer" className="text-grass hover:underline">Open</a> : "—" },
                { label: "Video", value: project.video_url ? <a href={project.video_url} target="_blank" rel="noreferrer" className="text-grass hover:underline">Open</a> : "—" },
                { label: "Slides", value: project.slides_path ? <a href={`/api/projects/${project.team_id}/slides`} className="text-grass hover:underline">Download PDF</a> : "—" },
                { label: "What it does", value: <span className="whitespace-pre-line">{project.description}</span> },
              ]} />
            ) : <p className="text-sm text-muted">{approved && open ? "Your Team Leader submits the project." : "Nothing submitted yet."}</p>}
        </Card>
        <Card>
          <CardTitle>Tips</CardTitle>
          <ul className="list-disc space-y-2 pl-5 text-sm text-ink-soft">
            <li>Make the repository public, with a README that explains how to run it.</li>
            <li>A 2–3 minute demo video helps judges who cannot try the app.</li>
            <li>Export slides as a PDF so they open on any device.</li>
            {project && <li>Last saved {formatDateTime(project.updated_at, tz)}.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
