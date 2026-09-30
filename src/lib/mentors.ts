import type { MentorRequestStatus } from "@/lib/types";

/** Topics a team can ask about (must match the check in mentor_requests.topic). */
export const MENTOR_TOPICS = ["Frontend", "Backend", "Mobile", "AI / ML", "Design", "Deployment", "Idea & pitch", "Other"] as const;

export const MENTOR_STATUS: Record<MentorRequestStatus, { label: string; tone: "amber" | "blue" | "green" | "neutral" }> = {
  waiting: { label: "Waiting", tone: "amber" },
  helping: { label: "Mentor on the way", tone: "blue" },
  done: { label: "Done", tone: "green" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** "just now", "4 min", "1 h 20 min" between two times. */
export function minutesBetween(from: string, to: number): string {
  const m = Math.max(0, Math.round((to - new Date(from).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** The time a server page is rendered at (wait times are measured from it). */
export function renderedAt(): number {
  return Date.now();
}
