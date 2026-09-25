import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { PublicShell } from "@/components/layout/public-shell";
import { Badge, LinkButton, buttonClass } from "@/components/ui";
import { formAvailability } from "@/lib/data/event";
import { formatEventDates } from "@/lib/pdf/id-cards";
import { PLATFORM, hostRequestMailto } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import type { Hackathon, RegistrationForm } from "@/lib/types";

export const dynamic = "force-dynamic";

const FEATURES: { title: string; body: string; icon: IconName; block: string }[] = [
  { title: "Registration forms", body: "Build your form, share one link, and every team appears in your dashboard the moment it registers.", icon: "form", block: "bg-pop" },
  { title: "Unique IDs, no duplicates", body: "Team and Participant IDs are generated automatically. Team names, emails and phone numbers can't be reused.", icon: "shield", block: "bg-sky" },
  { title: "Print-ready ID cards", body: "Branded cards with a secure QR code, laid out on A4 sheets in the size you choose.", icon: "idcard", block: "bg-pink" },
  { title: "QR attendance", body: "Officials scan a card and the participant is marked present instantly. Duplicates are blocked.", icon: "qr", block: "bg-brand-tint" },
  { title: "Officials & permissions", body: "Invite your volunteers with exactly the access they need. Every action is audit-logged.", icon: "users", block: "bg-sky" },
  { title: "Student portal", body: "Participants activate their account with the code on their card for announcements, schedule and support.", icon: "user", block: "bg-pop" },
];

const STEPS = [
  { n: "01", title: "Contact us", body: "Tell us about your event. We set up your hackathon and invite your organiser." },
  { n: "02", title: "Share your form", body: "Build the registration form and share one link. Teams get their IDs instantly." },
  { n: "03", title: "Run the day", body: "Print ID cards, scan QR codes at the gate, and answer support from one dashboard." },
];

/** Platform home: what the product does, open events, and how to host one. */
export default async function HomePage() {
  const supabase = await createClient();
  const [{ data: hackathons }, { data: forms }] = await Promise.all([
    supabase.from("hackathons").select("*").in("status", ["active"]).order("starts_at", { ascending: true, nullsFirst: false }).returns<Hackathon[]>(),
    supabase.from("registration_forms").select("*").eq("status", "published").returns<RegistrationForm[]>(),
  ]);
  const openForm = (h: Hackathon) => (forms ?? []).find((f) => f.hackathon_id === h.id && formAvailability(f).open);

  return (
    <PublicShell>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <span className="inline-flex rotate-[-1.5deg] items-center rounded-sm border-2 border-line bg-pink px-2.5 py-1 text-xs font-bold tracking-wide text-ink uppercase shadow-brutal-sm">
            For colleges, clubs and event teams
          </span>
          <h1 className="mt-6 text-5xl leading-[0.95] font-bold tracking-tight text-balance text-ink sm:text-7xl">
            Run your{" "}
            <span className="inline-block rotate-[-1deg] border-2 border-line bg-pop px-2 shadow-brutal">whole</span>{" "}
            hackathon from one place.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-soft">
            Registration, unique IDs, print-ready ID cards, QR attendance, officials and a student portal, ready for your event.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={hostRequestMailto()} className={buttonClass("primary", "md", "px-5 text-base")}>
              Host your hackathon <Icon name="arrowRight" className="size-4" />
            </a>
            <LinkButton href="/login" variant="secondary" className="px-5 text-base">Sign in</LinkButton>
          </div>
        </div>
        <div className="relative hidden lg:block" aria-hidden="true">
          <div className="rotate-2 rounded-lg border-2 border-line bg-surface p-5 pb-20 shadow-brutal-lg">
            <p className="font-heading text-sm font-bold tracking-wide uppercase">Teams · live</p>
            <ul className="mt-3 divide-y-2 divide-line-soft text-sm">
              {[["Code Warriors", "KH2026-T0015", "bg-ok-tint", "Approved"], ["Byte Brigade", "KH2026-T0016", "bg-warn-tint", "Pending"], ["Pixel Pioneers", "KH2026-T0017", "bg-ok-tint", "Approved"]].map(([t, id, c, s]) => (
                <li key={id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-bold">{t}<span className="block font-mono text-xs font-normal text-muted">{id}</span></span>
                  <span className={`rounded-sm border-2 border-line px-2 py-0.5 text-xs font-bold ${c}`}>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="absolute right-6 -bottom-6 -rotate-3 rounded-lg border-2 border-line bg-sky px-4 py-3 shadow-brutal">
            <p className="text-xs font-bold uppercase">Checked in</p>
            <p className="font-heading text-3xl font-bold">412<span className="text-base">/486</span></p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="events-heading">
        <h2 id="events-heading" className="mb-5 text-3xl font-bold text-ink">Hackathons</h2>
        {hackathons && hackathons.length > 0 ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {hackathons.map((h) => {
              const form = openForm(h);
              return (
                <li key={h.id} className="flex h-full flex-col rounded-lg border-2 border-line bg-surface p-5 shadow-brutal">
                  <p className="self-start rounded-sm border-2 border-line bg-sky-tint px-2 py-0.5 text-xs font-bold text-ink">
                    {formatEventDates(h.starts_at, h.ends_at, h.timezone) || "Dates to be announced"}
                  </p>
                  <h3 className="mt-3 text-xl font-bold text-ink">
                    <Link href={`/h/${h.slug}`} className="underline-offset-4 hover:underline">{h.name}</Link>
                  </h3>
                  {h.organizer_name && <p className="text-sm text-muted">{h.organizer_name}</p>}
                  {h.tagline && <p className="mt-2 text-sm text-ink-soft">{h.tagline}</p>}
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    {form ? <LinkButton href={`/register/${form.slug}`} size="sm">Register your team</LinkButton> : <Badge>Registration not open</Badge>}
                    <LinkButton href={`/h/${h.slug}`} variant="secondary" size="sm">Details</LinkButton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border-2 border-dashed border-line bg-surface/60 p-6 text-sm text-muted">No hackathons are open right now.</p>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="features-heading">
        <h2 id="features-heading" className="mb-5 text-3xl font-bold text-ink">Everything your event needs</h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-lg border-2 border-line bg-surface p-5 shadow-brutal">
              <span className={`grid size-11 place-items-center rounded-md border-2 border-line ${f.block}`}>
                <Icon name={f.icon} className="size-5" />
              </span>
              <p className="mt-4 font-heading text-lg font-bold text-ink">{f.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="mb-5 text-3xl font-bold text-ink">How it works</h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-lg border-2 border-line bg-paper-2 p-5">
              <span className="font-heading text-4xl font-bold text-brand">{s.n}</span>
              <p className="mt-2 font-heading text-lg font-bold text-ink">{s.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24" aria-labelledby="host-heading">
        <div className="rounded-lg border-2 border-line bg-brand p-6 text-white shadow-brutal-lg sm:p-10">
          <h2 id="host-heading" className="text-3xl font-bold sm:text-4xl">Want to conduct a hackathon?</h2>
          <p className="mt-3 max-w-2xl text-white/90">
            Contact the platform admin to register and manage your hackathon. We set up your event and send your organiser an Admin
            invitation. From there you build your form, invite your officials and run the event.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a href={hostRequestMailto()} className={buttonClass("success", "md", "px-5 text-base")}>
              <Icon name="mail" className="size-5" /> Contact the admin
            </a>
            <a href={`mailto:${PLATFORM.contactEmail}`} className="font-bold text-white underline underline-offset-4">{PLATFORM.contactEmail}</a>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
