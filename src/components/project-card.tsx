import { Icon } from "@/components/icons";
import { Badge, Card, CardTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { repoLabel } from "@/lib/projects";
import type { ProjectSubmission } from "@/lib/types";

/** A team's submitted project: name, description and its links (repository, demo, video, slides). */
export function ProjectCard({ project, tz }: { project: ProjectSubmission | null; tz?: string }) {
  return (
    <Card>
      <CardTitle actions={project ? <Badge tone="green">Submitted</Badge> : <Badge tone="amber">Not submitted</Badge>}>Project</CardTitle>
      {!project ? <p className="text-sm text-muted">The team has not submitted a project yet.</p> : (
        <div className="space-y-3">
          <p className="text-base font-semibold text-ink">{project.title}</p>
          <p className="text-sm whitespace-pre-line text-ink-soft">{project.description}</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            <ProjectLink href={project.repo_url} label={repoLabel(project.repo_url)} icon="form" />
            {project.demo_url && <ProjectLink href={project.demo_url} label="Live demo" icon="arrowRight" />}
            {project.video_url && <ProjectLink href={project.video_url} label="Video" icon="arrowRight" />}
            {project.slides_path && <ProjectLink href={`/api/projects/${project.team_id}/slides`} label="Slides (PDF)" icon="idcard" download />}
          </ul>
          <p className="text-xs text-muted">Last updated {formatDateTime(project.updated_at, tz)}</p>
        </div>
      )}
    </Card>
  );
}

function ProjectLink({ href, label, icon, download }: { href: string; label: string; icon: "form" | "arrowRight" | "idcard"; download?: boolean }) {
  return (
    <li>
      <a href={href} {...(download ? {} : { target: "_blank", rel: "noreferrer" })}
        className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 font-medium break-all text-ink hover:border-brand/40 hover:text-brand">
        <Icon name={icon} className="size-4 shrink-0 text-muted" />{label}
      </a>
    </li>
  );
}
