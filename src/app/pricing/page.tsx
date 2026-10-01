import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { PublicShell } from "@/components/layout/public-shell";
import { LinkButton } from "@/components/ui";
import { hackathonPricePaise } from "@/lib/billing";
import { PLATFORM } from "@/lib/platform";
import { formatInr } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing" };

const INCLUDED = [
  "Your own hackathon workspace, ready the moment you pay",
  "Registration form with one shareable link and unlimited teams",
  "Unique Team and Participant IDs, print-ready ID cards with QR codes",
  "QR attendance and meal tracking at the venue",
  "Officials, judges and mentors with exactly the access they need",
  "Project submissions, judging, public results and certificates",
  "Food ordering, announcements, schedule and help desk",
  "Full data export (ZIP) when the hackathon ends",
];

/** The one product we sell and its price (the Super Admin sets it). */
export default async function PricingPage() {
  const price = formatInr(await hackathonPricePaise());
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Pricing</h1>
        <p className="mt-3 text-lg text-ink-soft">One simple price. Pay once per hackathon. No subscription, no per-team fees.</p>

        <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-brutal-lg sm:p-8">
          <p className="text-sm font-bold uppercase tracking-wide text-muted">{PLATFORM.name}</p>
          <h2 className="mt-1 text-2xl font-bold text-ink">Hackathon licence</h2>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="font-heading text-5xl font-bold text-ink">{price}</span>
            <span className="text-ink-soft">per hackathon · one-time</span>
          </p>
          <p className="mt-1 text-sm text-muted">Price in Indian Rupees, inclusive of all charges. Paid securely through Razorpay (UPI, cards, net banking, wallets).</p>
          <ul className="mt-6 space-y-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-2 text-ink-soft">
                <Icon name="check" className="mt-0.5 size-5 shrink-0 text-grass" /> {item}
              </li>
            ))}
          </ul>
          <LinkButton href="/start" className="mt-8 w-full px-5 text-base sm:w-auto">Start your hackathon · {price}</LinkButton>
          <p className="mt-3 text-sm text-muted">
            Delivered instantly online. See our <a className="font-semibold text-grass underline" href="/refund-policy">Cancellation &amp; Refund Policy</a>.
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
