"use client";

import { useEffect, useState } from "react";

const UNITS = [
  { label: "Days", ms: 86_400_000, tone: "text-sky" },
  { label: "Hours", ms: 3_600_000, tone: "text-grass" },
  { label: "Minutes", ms: 60_000, tone: "text-pink" },
  { label: "Seconds", ms: 1000, tone: "text-pop" },
] as const;

/**
 * Pixel countdown to the hackathon start, then to its end. The server passes
 * `now` so the first render matches (no hydration flash); it then ticks each second.
 */
export function Countdown({ startsAt, endsAt, now }: { startsAt: string | null; endsAt: string | null; now: number }) {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const start = startsAt ? Date.parse(startsAt) : NaN;
  const end = endsAt ? Date.parse(endsAt) : NaN;
  const target = t < start ? start : t < end ? end : NaN;
  const title = t < start ? "Event starts in" : t < end ? "Event ends in" : Number.isNaN(start) ? "Event dates" : "Event finished";

  const left = Number.isNaN(target) ? 0 : Math.max(0, target - t);
  // Each unit is what remains after the larger units (days, then hours, ...).
  const parts = UNITS.map((u, i) => ({ ...u, v: Math.floor((i === 0 ? left : left % UNITS[i - 1].ms) / u.ms) }));

  return (
    <div className="panel rounded-lg border-2 border-line p-4">
      <p className="font-pixel mb-3 text-lg text-ink">{title}</p>
      {Number.isNaN(target) ? (
        <p className="text-sm text-ink-soft">{Number.isNaN(start) ? "Set the start and end dates in Event Setup." : "The event has finished."}</p>
      ) : (
        <div className="grid grid-cols-4 gap-2" role="timer" aria-live="off" aria-label={`${title} ${parts.map((p) => `${p.v} ${p.label}`).join(", ")}`}>
          {parts.map((p) => (
            <div key={p.label} className="text-center">
              <div className={`rounded-md border-2 border-line bg-paper py-2 font-heading text-3xl font-bold tabular-nums shadow-[inset_2px_2px_0_0_rgb(0_0_0/0.5)] ${p.tone}`}>{String(p.v).padStart(2, "0")}</div>
              <p className="font-pixel mt-1 text-xs text-ink-soft">{p.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
