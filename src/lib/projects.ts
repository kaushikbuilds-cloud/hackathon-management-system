import type { Hackathon } from "@/lib/types";

/** Mirrors the database check on project_submissions.repo_url. */
export const REPO_URL_RE = /^https:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[^/\s]+\/[^/\s]+\/?$/i;
export const LINK_RE = /^https?:\/\/\S+$/i;

/** Whether teams can submit or edit their project right now. */
export function projectsOpen(h: Pick<Hackathon, "projects_open" | "projects_deadline"> | null | undefined, now = Date.now()): boolean {
  if (!h?.projects_open) return false;
  return !h.projects_deadline || Date.parse(h.projects_deadline) > now;
}

/** "github.com/acme/smart-bins" from a repository URL, for compact display. */
export function repoLabel(url: string): string {
  return url.replace(/^https:\/\/(www\.)?/i, "").replace(/\/$/, "");
}
