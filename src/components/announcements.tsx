import { Badge, Card, CardTitle, EmptyState } from "@/components/ui";
import { formatDateTime, formatTime } from "@/lib/format";
import type { Announcement, ScheduleItem } from "@/lib/types";

export function AnnouncementFeed({ items, timeZone, title = "Announcements" }: { items: Announcement[]; timeZone: string; title?: string }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {items.length === 0 ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className={`rounded-xl p-4 ${a.is_important ? "border border-violet-500/40 bg-violet-500/10" : "bg-navy-850"}`}>
              <p className="flex flex-wrap items-center gap-2 font-semibold text-white">
                {a.title}
                {a.is_important && <Badge tone="violet">Important</Badge>}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(a.published_at, timeZone)}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** `now` is passed in (epoch ms) so rendering stays pure. */
export function ScheduleList({ items, timeZone, now }: { items: ScheduleItem[]; timeZone: string; now: number }) {
  return (
    <Card>
      <CardTitle>Event schedule</CardTitle>
      {items.length === 0 ? (
        <EmptyState title="Schedule coming soon" />
      ) : (
        <ol className="relative space-y-4 border-l border-navy-700 pl-5">
          {items.map((s) => {
            const live = new Date(s.starts_at).getTime() <= now && (!s.ends_at || new Date(s.ends_at).getTime() >= now);
            return (
              <li key={s.id} className="relative">
                <span className={`absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full ${live ? "bg-emerald-400" : "bg-violet-400"}`} aria-hidden="true" />
                <p className="text-xs font-semibold text-violet-300">
                  {formatDateTime(s.starts_at, timeZone)}{s.ends_at && ` – ${formatTime(s.ends_at, timeZone)}`}
                  {live && <span className="ml-2 text-emerald-300">Now</span>}
                </p>
                <p className="font-semibold text-white">{s.title}</p>
                {s.venue && <p className="text-sm text-slate-400">{s.venue}</p>}
                {s.description && <p className="text-sm text-slate-300">{s.description}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
