"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Checkbox, TextArea, TextField } from "@/components/ui";
import type { ProjectSubmission } from "@/lib/types";
import { saveProject, type ProjectFormState } from "./actions";

export function ProjectForm({ project, hasSlides }: { project: ProjectSubmission | null; hasSlides: boolean }) {
  const [state, action] = useActionState<ProjectFormState, FormData>(saveProject, {});
  const v = state.values ?? {
    title: project?.title ?? "", description: project?.description ?? "", repo_url: project?.repo_url ?? "",
    demo_url: project?.demo_url ?? "", video_url: project?.video_url ?? "",
  };
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.ok && <Alert tone="green">{state.message}</Alert>}
      <TextField label="Project name" name="title" required maxLength={100} defaultValue={v.title} error={e.title} />
      <TextArea label="What does it do?" name="description" required maxLength={2000} rows={5} defaultValue={v.description} error={e.description}
        hint="The problem, your solution and how it works. Judges read this first." />
      <TextField label="GitHub / GitLab repository" name="repo_url" type="url" required maxLength={300} defaultValue={v.repo_url} error={e.repo_url}
        placeholder="https://github.com/your-team/your-project" hint="Make it public (or add the organisers) so judges can open it." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Live demo link (optional)" name="demo_url" type="url" maxLength={300} defaultValue={v.demo_url} error={e.demo_url} placeholder="https://…" />
        <TextField label="Video link (optional)" name="video_url" type="url" maxLength={300} defaultValue={v.video_url} error={e.video_url} placeholder="YouTube or Google Drive link" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="slides" className="block text-sm font-medium text-ink-soft">Slides (optional, PDF up to 10 MB)</label>
        <input id="slides" name="slides" type="file" accept="application/pdf" aria-describedby={e.slides ? "slides-error" : "slides-hint"}
          className="block text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-paper-2" />
        {e.slides ? <p id="slides-error" role="alert" className="text-xs font-bold text-danger">{e.slides}</p>
          : <p id="slides-hint" className="text-xs text-muted">{hasSlides ? "Uploading a new PDF replaces the current slides." : "PowerPoint or Google Slides: File → Download → PDF."}</p>}
        {hasSlides && <Checkbox name="remove_slides" label="Remove the current slides" />}
      </div>
      <SubmitButton pendingText="Saving…">{project ? "Update project" : "Submit project"}</SubmitButton>
    </form>
  );
}
