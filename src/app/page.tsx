import { PublicShell } from "@/components/layout/public-shell";
import { Card, LinkButton, Badge, EmptyState } from "@/components/ui";
import { brandingUrls, formAvailability, getHackathon } from "@/lib/data/event";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatTime } from "@/lib/format";
import { formatEventDates } from "@/lib/pdf/id-cards";
import type { RegistrationForm, ScheduleItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const hackathon = await getHackathon();
  const supabase = await createClient();
  const [{ data: forms }, { data: schedule }] = await Promise.all([
    supabase.from("registration_forms").select("*").eq("status", "published").order("published_at", { ascending: false }).returns<RegistrationForm[]>(),
    supabase.from("event_schedule").select("*").eq("visibility", "public").order("starts_at").limit(20).returns<ScheduleItem[]>(),
  ]);
  const form = forms?.[0];
  const availability = form ? formAvailability(form) : { open: false };
  const tz = hackathon?.timezone ?? "UTC";
  const { logo } = brandingUrls(hackathon);

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        {!hackathon ? (
          <EmptyState title="The event has not been configured yet">An administrator needs to complete Event Setup.</EmptyState>
        ) : (
          <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo && <img src={logo} alt="" className="mb-6 h-14 w-auto" />}
              <Badge tone="violet">{formatEventDates(hackathon.starts_at, hackathon.ends_at, tz) || "Dates to be announced"}</Badge>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-6xl">
                <span className="bg-gradient-to-r from-white via-blue-100 to-violet-300 bg-clip-text text-transparent">{hackathon.name}</span>
              </h1>
              {hackathon.tagline && <p className="mt-4 text-lg text-slate-300">{hackathon.tagline}</p>}
              {hackathon.description && <p className="mt-4 max-w-2xl whitespace-pre-line text-slate-400">{hackathon.description}</p>}
              <div className="mt-8 flex flex-wrap gap-3">
                {form && availability.open ? (
                  <LinkButton href={`/register/${form.slug}`}>Register your team</LinkButton>
                ) : (
                  <span className="rounded-lg border border-navy-600 px-4 py-2 text-sm text-slate-300">{"reason" in availability && availability.reason ? availability.reason : "Registration is not open."}</span>
                )}
                <LinkButton href="/login" variant="secondary">Team &amp; staff sign in</LinkButton>
              </div>
            </div>
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Event details</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div><dt className="text-slate-400">Venue</dt><dd className="text-slate-100">{hackathon.venue ?? "To be announced"}</dd></div>
                <div><dt className="text-slate-400">Starts</dt><dd className="text-slate-100">{formatDateTime(hackathon.starts_at, tz)}</dd></div>
                <div><dt className="text-slate-400">Ends</dt><dd className="text-slate-100">{formatDateTime(hackathon.ends_at, tz)}</dd></div>
                {form && <div><dt className="text-slate-400">Team size</dt><dd className="text-slate-100">{form.min_team_size}–{form.max_team_size} members</dd></div>}
                {form?.closes_at && <div><dt className="text-slate-400">Registration closes</dt><dd className="text-slate-100">{formatDateTime(form.closes_at, tz)}</dd></div>}
                {hackathon.organizer_name && <div><dt className="text-slate-400">Organiser</dt><dd className="text-slate-100">{hackathon.organizer_name}</dd></div>}
              </dl>
            </Card>
          </div>
        )}
      </section>
      {schedule && schedule.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-20" aria-labelledby="schedule-heading">
          <h2 id="schedule-heading" className="mb-4 text-xl font-semibold text-white">Schedule</h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {schedule.map((item) => (
              <li key={item.id} className="rounded-xl border border-navy-700 bg-navy-900/70 p-4">
                <p className="text-xs font-semibold text-violet-300">
                  {formatDateTime(item.starts_at, tz)}
                  {item.ends_at && ` – ${formatTime(item.ends_at, tz)}`}
                </p>
                <p className="mt-1 font-semibold text-white">{item.title}</p>
                {item.venue && <p className="text-sm text-slate-400">{item.venue}</p>}
                {item.description && <p className="mt-1 text-sm text-slate-300">{item.description}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </PublicShell>
  );
}
