import { FaqList } from "@/components/faq";
import { PublicShell } from "@/components/layout/public-shell";
import { Card, LinkButton, Badge } from "@/components/ui";
import { notFound } from "next/navigation";
import { brandingUrls, formAvailability, getHackathonBySlug } from "@/lib/data/event";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatTime } from "@/lib/format";
import { formatEventDates } from "@/lib/pdf/id-cards";
import type { Faq, RegistrationForm, ScheduleItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/h/[slug]">) {
  const hackathon = await getHackathonBySlug((await props.params).slug);
  return { title: hackathon?.name ?? "Hackathon", description: hackathon?.tagline ?? undefined };
}

/** Public event page of one hackathon. */
export default async function EventPage(props: PageProps<"/h/[slug]">) {
  const hackathon = await getHackathonBySlug((await props.params).slug);
  if (!hackathon || hackathon.status === "archived") notFound();
  const supabase = await createClient();
  const [{ data: forms }, { data: schedule }, { data: faqs }] = await Promise.all([
    supabase.from("registration_forms").select("*").eq("hackathon_id", hackathon.id).eq("status", "published").order("published_at", { ascending: false }).returns<RegistrationForm[]>(),
    supabase.from("event_schedule").select("*").eq("hackathon_id", hackathon.id).eq("visibility", "public").order("starts_at").limit(20).returns<ScheduleItem[]>(),
    supabase.from("hackathon_faqs").select("*").eq("hackathon_id", hackathon.id).eq("is_published", true).eq("audience", "public")
      .order("sort_order").order("created_at").returns<Faq[]>(),
  ]);
  const form = forms?.[0];
  const availability = form ? formAvailability(form) : { open: false };
  const tz = hackathon?.timezone ?? "UTC";
  const { logo } = brandingUrls(hackathon);

  return (
    <PublicShell hackathon={hackathon}>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        {(
          <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo && <img src={logo} alt="" className="mb-6 h-14 w-auto" />}
              <Badge tone="violet">{formatEventDates(hackathon.starts_at, hackathon.ends_at, tz) || "Dates to be announced"}</Badge>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink sm:text-6xl">
                {hackathon.name}
              </h1>
              {hackathon.tagline && <p className="mt-4 text-lg text-ink-soft">{hackathon.tagline}</p>}
              {hackathon.description && <p className="mt-4 max-w-2xl whitespace-pre-line text-muted">{hackathon.description}</p>}
              <div className="mt-8 flex flex-wrap gap-3">
                {form && availability.open ? (
                  <LinkButton href={`/register/${form.slug}`}>Register your team</LinkButton>
                ) : (
                  <span className="rounded-lg border-2 border-line px-4 py-2 text-sm text-ink-soft">{"reason" in availability && availability.reason ? availability.reason : "Registration is not open."}</span>
                )}
                <LinkButton href="/login" variant="secondary">Team &amp; staff sign in</LinkButton>
              </div>
            </div>
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Event details</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div><dt className="text-muted">Venue</dt><dd className="text-ink">{hackathon.venue ?? "To be announced"}</dd></div>
                <div><dt className="text-muted">Starts</dt><dd className="text-ink">{formatDateTime(hackathon.starts_at, tz)}</dd></div>
                <div><dt className="text-muted">Ends</dt><dd className="text-ink">{formatDateTime(hackathon.ends_at, tz)}</dd></div>
                {form && <div><dt className="text-muted">Team size</dt><dd className="text-ink">{form.min_team_size}–{form.max_team_size} members</dd></div>}
                {form?.closes_at && <div><dt className="text-muted">Registration closes</dt><dd className="text-ink">{formatDateTime(form.closes_at, tz)}</dd></div>}
                {hackathon.organizer_name && <div><dt className="text-muted">Organiser</dt><dd className="text-ink">{hackathon.organizer_name}</dd></div>}
              </dl>
            </Card>
          </div>
        )}
      </section>
      {schedule && schedule.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-20" aria-labelledby="schedule-heading">
          <h2 id="schedule-heading" className="mb-4 text-xl font-semibold text-ink">Schedule</h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {schedule.map((item) => (
              <li key={item.id} className="rounded-md border-2 border-line bg-paper p-4">
                <p className="text-xs font-semibold text-grass">
                  {formatDateTime(item.starts_at, tz)}
                  {item.ends_at && ` – ${formatTime(item.ends_at, tz)}`}
                </p>
                <p className="mt-1 font-semibold text-ink">{item.title}</p>
                {item.venue && <p className="text-sm text-muted">{item.venue}</p>}
                {item.description && <p className="mt-1 text-sm text-ink-soft">{item.description}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {faqs && faqs.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 pb-20" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="mb-4 text-2xl font-bold text-ink">Frequently asked questions</h2>
          <FaqList items={faqs} footer={hackathon.contact_email ? (
            <p className="text-sm text-ink-soft">Still have a question? Email <a className="font-bold text-grass underline-offset-4 hover:underline" href={`mailto:${hackathon.contact_email}`}>{hackathon.contact_email}</a>.</p>
          ) : undefined} />
        </section>
      )}
    </PublicShell>
  );
}
