import type { Counted } from "@/lib/data/stats";

/** Accessible horizontal bar list: each row states its label and value in text. */
export function BarList({ items, labels, max = 8 }: { items: Counted[]; labels?: Record<string, string>; max?: number }) {
  const shown = items.slice(0, max);
  const top = Math.max(1, ...shown.map((i) => i.value));
  if (shown.length === 0) return <p className="text-sm text-muted">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {shown.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-ink">{labels?.[i.label] ?? i.label}</span>
            <span className="font-bold text-ink tabular-nums">{i.value}</span>
          </div>
          <div className="h-3 rounded-sm border-2 border-line bg-paper" aria-hidden="true">
            <div className="h-full bg-brand" style={{ width: `${(i.value / top) * 100}%` }} />
          </div>
        </li>
      ))}
      {items.length > max && <li className="text-xs text-muted">+{items.length - max} more</li>}
    </ul>
  );
}
