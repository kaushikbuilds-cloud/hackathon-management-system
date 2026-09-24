export const SUPPORT_STATUSES = ["new", "assigned", "in_progress", "resolved", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_CATEGORIES = [
  { value: "technical", label: "Technical" },
  { value: "logistics", label: "Logistics / venue" },
  { value: "registration", label: "Registration" },
  { value: "id_card", label: "ID card" },
  { value: "food", label: "Food" },
  { value: "medical", label: "Medical" },
  { value: "other", label: "Other" },
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["value"];

/** Mirrors `public.support_transition_allowed` in the database. */
const TRANSITIONS: Record<SupportStatus, SupportStatus[]> = {
  new: ["assigned", "in_progress", "closed"],
  assigned: ["in_progress", "resolved", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["closed", "in_progress"],
  closed: [],
};

export function canTransition(from: SupportStatus, to: SupportStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: SupportStatus): SupportStatus[] {
  return TRANSITIONS[from];
}

export function supportStatusLabel(status: SupportStatus): string {
  return { new: "New", assigned: "Assigned", in_progress: "In progress", resolved: "Resolved", closed: "Closed" }[status];
}

export function supportCategoryLabel(category: string): string {
  return SUPPORT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
