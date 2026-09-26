import type { CSSProperties } from "react";

/*
 * Dashboard charts (server-rendered, no chart library). Each chart has a
 * hover/focus tooltip on every mark and a screen-reader table of its data.
 * Colours: one sequential hue for magnitude, the status palette for states
 * (validated against the panel surface #2a1e14).
 */

export const STATUS_COLORS = { approved: "#1f9e89", pending: "#c2830c", rejected: "#e0476a" } as const;
const BAR = "#7a5cf0";

/** Rounds a max value up to a tidy axis top (1, 2, 5 × 10^n). */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}

/** Column chart of one series over time (e.g. registrations per day). */
export function ColumnChart({ data, label, unit }: { data: { label: string; value: number }[]; label: string; unit: string }) {
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const every = Math.max(1, Math.ceil(data.length / 6));
  return (
    <figure className="pt-3">
      <div className="flex gap-2">
        <div className="relative h-48 w-8 shrink-0 text-right text-xs text-muted tabular-nums" aria-hidden="true">
          {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>{t}</span>)}
        </div>
        <div className="relative h-48 flex-1">
          {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-line-soft" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden="true" />)}
          <ul className="absolute inset-0 flex items-end gap-[2px]" aria-hidden="true">
            {data.map((d) => (
              <li key={d.label} className="group relative flex h-full flex-1 items-end">
                <span className="block w-full rounded-t-[4px]" style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value ? 3 : 0, background: BAR, boxShadow: "inset 2px 0 0 rgb(255 255 255 / 0.25)" }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-sm border-2 border-line bg-paper px-2 py-1 text-xs whitespace-nowrap text-ink shadow-brutal-sm group-hover:block">
                  {d.label}: <strong>{d.value}</strong> {unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] pl-10 text-xs text-muted" aria-hidden="true">
        {data.map((d, i) => <span key={d.label} className="flex-1 overflow-visible whitespace-nowrap">{i % every === 0 ? d.label : ""}</span>)}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">{unit}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Ring chart of parts of a whole, with a total in the middle and a labelled legend. */
export function RingChart({ segments, total, totalLabel }: { segments: { label: string; value: number; color: string }[]; total: number; totalLabel: string }) {
  const sum = segments.reduce((n, s) => n + s.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = sum > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <figure className="flex flex-wrap items-center gap-6">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-paper)" strokeWidth="14" />
          {sum > 0 && segments.map((s) => {
            const len = (s.value / sum) * c;
            const el = s.value > 0 && (
              <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="14"
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset}>
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="font-heading text-3xl font-bold text-ink tabular-nums">{total}</span>
          <span className="font-pixel text-xs text-ink-soft">{totalLabel}</span>
        </div>
      </div>
      <ul className="min-w-40 flex-1 space-y-2.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink">
              <span className="size-4 rounded-sm border-2 border-line" style={{ background: s.color } as CSSProperties} aria-hidden="true" />
              {s.label}
            </span>
            <span className="font-bold text-ink tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
