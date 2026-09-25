import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";
import { Badge, Card, LinkButton } from "@/components/ui";
import { formAvailability } from "@/lib/data/event";
import { formatEventDates } from "@/lib/pdf/id-cards";
import { PLATFORM, hostRequestMailto } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import type { Hackathon, RegistrationForm } from "@/lib/types";

export const dynamic = "force-dynamic";

const FEATURES = [
  { title: "Registration forms", body: "Build your form, share one link, and every team appears in your dashboard the moment it registers." },
  { title: "Unique IDs, no duplicates", body: "Team and Participant IDs are generated automatically. Team names, emails and phone numbers can't be reused." },
  { title: "Print-ready ID cards", body: "Branded cards with a secure QR code, laid out on A4 sheets in the size you choose." },
  { title: "QR attendance", body: "Officials scan a card and the participant is marked present instantly. Duplicates are blocked." },
  { title: "Officials & permissions", body: "Invite your volunteers with exactly the access they need. Every action is audit-logged." },
  { title: "Student portal", body: "Participants activate their account with the code on their card for announcements, schedule and support." },
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
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <Badge tone="violet">For colleges, clubs and event teams</Badge>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
          <span className="bg-gradient-to-r from-white via-blue-100 to-violet-300 bg-clip-text text-transparent">Run your whole hackathon from one place.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          Registration, teams, ID cards, QR attendance, officials and a student portal, ready for your event.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={hostRequestMailto()} className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 hover:from-blue-500 hover:to-violet-500">
            Host your hackathon
          </a>
          <LinkButton href="/login" variant="secondary">Sign in</LinkButton>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="events-heading">
        <h2 id="events-heading" className="mb-4 text-xl font-semibold text-white">Hackathons</h2>
        {hackathons && hackathons.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hackathons.map((h) => {
              const form = openForm(h);
              return (
                <li key={h.id}>
                  <Card className="flex h-full flex-col">
                    <p className="text-xs font-semibold text-violet-300">{formatEventDates(h.starts_at, h.ends_at, h.timezone) || "Dates to be announced"}</p>
                    <h3 className="mt-1 text-lg font-semibold text-white"><Link href={`/h/${h.slug}`} className="hover:underline">{h.name}</Link></h3>
                    {h.organizer_name && <p className="text-sm text-slate-400">{h.organizer_name}</p>}
                    {h.tagline && <p className="mt-2 text-sm text-slate-300">{h.tagline}</p>}
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      {form ? <LinkButton href={`/register/${form.slug}`} size="sm">Register your team</LinkButton> : <Badge>Registration not open</Badge>}
                      <LinkButton href={`/h/${h.slug}`} variant="secondary" size="sm">Details</LinkButton>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No hackathons are open right now.</p>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="features-heading">
        <h2 id="features-heading" className="mb-4 text-xl font-semibold text-white">Everything your event needs</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-navy-700 bg-navy-900/70 p-5">
              <p className="font-semibold text-white">{f.title}</p>
              <p className="mt-1 text-sm text-slate-400">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24" aria-labelledby="host-heading">
        <Card className="p-6 sm:p-8">
          <h2 id="host-heading" className="text-2xl font-bold text-white">Want to conduct a hackathon?</h2>
          <p className="mt-2 max-w-2xl text-slate-300">
            Contact the platform admin to register and manage your hackathon. We set up your event and send your organiser an Admin
            invitation. From there you build your form, invite your officials and run the event.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={hostRequestMailto()} className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-semibold text-white hover:from-blue-500 hover:to-violet-500">
              Contact the admin
            </a>
            <a href={`mailto:${PLATFORM.contactEmail}`} className="text-sm text-violet-300 hover:text-violet-200">{PLATFORM.contactEmail}</a>
          </div>
        </Card>
      </section>
    </PublicShell>
  );
}
