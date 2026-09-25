import type { ReactNode } from "react";
import type { Faq } from "@/lib/types";

/** Groups answers by category (uncategorised first), keeping each group's order. */
export function groupFaqs(items: Faq[]): { category: string | null; items: Faq[] }[] {
  const groups = new Map<string, Faq[]>();
  for (const f of items) {
    const key = f.category?.trim() || "";
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : 0))
    .map(([category, list]) => ({ category: category || null, items: list }));
}

/** FAQ as native disclosure widgets: keyboard- and screen-reader-friendly, no JS. */
export function FaqList({ items, footer }: { items: Faq[]; footer?: ReactNode }) {
  return (
    <div className="space-y-6">
      {groupFaqs(items).map((g) => (
        <div key={g.category ?? "general"}>
          {g.category && <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">{g.category}</h3>}
          <div className="divide-y-2 divide-line-soft rounded-md border-2 border-line bg-surface">
            {g.items.map((f) => (
              <details key={f.id} className="group p-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold text-ink [&::-webkit-details-marker]:hidden">
                  <span>{f.question}</span>
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-sm border-2 border-line bg-pop text-sm transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      ))}
      {footer}
    </div>
  );
}
