"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireParticipant } from "@/lib/auth";
import { LINK_RE, REPO_URL_RE } from "@/lib/projects";
import { BUCKETS, uploadObject, validateUpload } from "@/lib/storage";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type ProjectFormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: { title: string; description: string; repo_url: string; demo_url: string; video_url: string };
};

const field = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

/** The team saves its project; the database checks the team, the deadline and the links again. */
export async function saveProject(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const session = await requireParticipant();
  const values = {
    title: field(formData, "title", 100), description: field(formData, "description", 2000),
    repo_url: field(formData, "repo_url", 300), demo_url: field(formData, "demo_url", 300), video_url: field(formData, "video_url", 300),
  };
  const fieldErrors: Record<string, string> = {};
  if (values.title.length < 2) fieldErrors.title = "Give your project a name.";
  if (values.description.length < 10) fieldErrors.description = "Describe your project in a sentence or two.";
  if (!REPO_URL_RE.test(values.repo_url)) fieldErrors.repo_url = "Paste the project link, e.g. https://github.com/your-team/your-project";
  if (values.demo_url && !LINK_RE.test(values.demo_url)) fieldErrors.demo_url = "Links start with https://";
  if (values.video_url && !LINK_RE.test(values.video_url)) fieldErrors.video_url = "Links start with https://";
  const file = formData.get("slides");
  const slides = file instanceof File && file.size > 0 ? await validateUpload(file, ["application/pdf"], 10 * 1024 * 1024) : null;
  if (slides && !slides.ok) fieldErrors.slides = `${slides.error} Export your slides as a PDF.`;
  if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_project", {
    p_title: values.title, p_description: values.description, p_repo: values.repo_url, p_demo: values.demo_url, p_video: values.video_url,
  });
  if (error) return { error: error.code === "42501" ? "Only your Team Leader can submit the project." : "Could not save the project. Please try again.", values };
  const result = data as { ok: boolean; message?: string };
  if (!result.ok) return { error: result.message ?? "Could not save the project.", values };

  const { data: teamId } = await supabase.rpc("my_team_id");
  if (slides?.ok && teamId) {
    const service = createServiceClient(session.userId);
    const path = `${session.hackathonId}/${teamId}/slides-${Date.now()}.pdf`;
    try {
      await uploadObject(BUCKETS.projectFiles, path, slides.bytes, slides.contentType);
      await service.from("project_submissions").update({ slides_path: path }).eq("team_id", teamId as string);
    } catch {
      return { ok: true, message: "Project saved, but the slides could not be uploaded. Please try the PDF again.", values };
    }
  }
  if (formData.get("remove_slides") === "on" && !slides && teamId) {
    await createServiceClient(session.userId).from("project_submissions").update({ slides_path: null }).eq("team_id", teamId as string);
  }
  await audit(session, "project.submitted", { type: "project_submissions", id: (teamId as string) ?? null });
  revalidatePath("/portal/project");
  revalidatePath("/portal");
  return { ok: true, message: "Project submitted. You can edit it until the deadline.", values };
}
