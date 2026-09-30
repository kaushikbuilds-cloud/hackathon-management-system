import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { PublicShell } from "@/components/layout/public-shell";
import { LinkButton, cx } from "@/components/ui";
import { getHackathonBySlug } from "@/lib/data/event";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { PublicResults } from "@/lib/types";

export const dynamic = "force-dynamic";

type Winner = Extract<PublicResults, { published: true }>["winners"][number];
const PODIUM = ["Winner", "1st Runner-up", "2nd Runner-up"];

export async function generateMetadata(props: PageProps<"/h/[slug]/results">) {
  const hackathon = await getHackathonBySlug((await props.params).slug);
  return { title: hackathon ? `Results · ${hackathon.name}` : "Results", description: hackathon ? `The winners of ${hackathon.name}.` : undefined };
}

/** Public winners page of one hackathon (only once the Admin publishes the results). */
export default async function ResultsPage(props: PageProps<"/h/[slug]/results">) {
  const { slug } = await props.params;
  const hackathon = await getHackathonBySlug(slug);
  if (!hackathon || hackathon.status === "archived") notFound();
  const { data } = await (await createClient()).rpc("public_results", { p_slug: slug });
  const results = (data ?? { published: false }) as PublicResults;
  const tz = hackathon.timezone ?? "UTC";

  return (
    <PublicShell hackathon={hackathon}>
      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <p className="text-sm font-semibold text-grass"><a href={`/h/${hackathon.slug}`} className="hover:underline">{hackathon.name}</a></p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-5xl">Results</h1>
        {!results.published ? (
          <div className="panel mt-8 rounded-lg border border-line p-8 text-center">
            <Icon name="trophy" className="mx-auto size-10 text-muted" />
            <p className="mt-3 text-lg font-semibold text-ink">The results haven&apos;t been announced yet</p>
            <p className="mt-1 text-sm text-muted">Check back after the judging. Participants will get a notification in their portal.</p>
            <div className="mt-6"><LinkButton href={`/h/${hackathon.slug}`} variant="secondary">Back to the event</LinkButton></div>
          </div>
        ) : (
          <>
            <p className="mt-3 max-w-2xl text-ink-soft">
              Congratulations to the winners, and thank you to all {results.team_count} teams and {results.participant_count} participants who took part.
            </p>
            {results.published_at && <p className="mt-1 text-sm text-muted">Announced {formatDateTime(results.published_at, tz)}</p>}
            {results.winners.length === 0 ? <p className="mt-8 text-muted">No awards have been given.</p> : (
              <>
                <ol className="mt-10 grid gap-4 lg:grid-cols-3" aria-label="Top teams">
                  {results.winners.filter((w) => PODIUM.includes(w.award)).map((w) => <WinnerCard key={w.award + w.team_name} w={w} featured={w.award === "Winner"} />)}
                </ol>
                {results.winners.some((w) => !PODIUM.includes(w.award)) && (
                  <>
                    <h2 className="mt-12 mb-4 text-xl font-semibold text-ink">Special awards</h2>
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {results.winners.filter((w) => !PODIUM.includes(w.award)).map((w) => <WinnerCard key={w.award + w.team_name} w={w} />)}
                    </ul>
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>
    </PublicShell>
  );
}

function WinnerCard({ w, featured = false }: { w: Winner; featured?: boolean }) {
  const p = w.project;
  return (
    <li className={cx("panel flex min-w-0 flex-col rounded-lg border p-5", featured ? "border-brand ring-2 ring-brand/20" : "border-line")}>
      <p className={cx("inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", featured ? "bg-pop" : "bg-brand-tint text-brand-hover")}>
        <Icon name="trophy" className="size-4" aria-hidden="true" />{w.award}
      </p>
      <h3 className="mt-3 text-lg font-bold text-ink">{w.team_name}</h3>
      {w.college && <p className="text-sm text-muted">{w.college}</p>}
      {w.members.length > 0 && <p className="mt-2 text-sm text-ink-soft">{w.members.join(", ")}</p>}
      {(w.track || w.statement) && (
        <p className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
          {w.track && <span className="rounded-full bg-sky-tint px-2 py-0.5 text-sky-ink">{w.track}</span>}
          {w.statement && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-ink-soft" title={w.statement.title}>{w.statement.code} · {w.statement.title}</span>}
        </p>
      )}
      {p && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="font-semibold text-ink">{p.title}</p>
          <p className="mt-1 line-clamp-4 text-sm text-ink-soft">{p.description}</p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
            <a href={p.repo_url} target="_blank" rel="noreferrer" className="text-grass hover:underline">Code<span className="sr-only"> of {p.title}</span></a>
            {p.demo_url && <a href={p.demo_url} target="_blank" rel="noreferrer" className="text-grass hover:underline">Demo<span className="sr-only"> of {p.title}</span></a>}
            {p.video_url && <a href={p.video_url} target="_blank" rel="noreferrer" className="text-grass hover:underline">Video<span className="sr-only"> of {p.title}</span></a>}
          </p>
        </div>
      )}
    </li>
  );
}
