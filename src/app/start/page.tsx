import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { PublicShell } from "@/components/layout/public-shell";
import { Alert, Card, LinkButton } from "@/components/ui";
import { getSession, homePathFor } from "@/lib/auth";
import { hackathonPricePaise, paymentMode } from "@/lib/billing";
import { formatInr } from "@/lib/razorpay";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Start your hackathon", description: "Sign up, pay once and run your whole hackathon on HackGround OS." };
export const dynamic = "force-dynamic";

const INCLUDED = [
  "Registration forms, team approval and fees",
  "ID cards with QR codes and fast check-in",
  "Food ordering, announcements and mentor help",
  "Judging, results page and certificates",
  "Android and Windows apps for your volunteers",
  "Full data export when the event ends",
];

/** Organisers sign up here and pay for their hackathon. */
export default async function StartPage() {
  const session = await getSession();
  if (session?.profile.role === "admin" && !session.hackathonId) redirect("/start/pay");
  const price = await hackathonPricePaise();
  const priceLabel = formatInr(price);
  const ready = (await paymentMode()).mode !== "off";

  return (
    <PublicShell>
      <section className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-14 lg:grid-cols-[1fr_32rem] lg:py-20">
        <div>
          <p className="text-sm font-semibold text-grass">For colleges, clubs and companies</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl">Start your hackathon today</h1>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">Create your account, pay once, and your hackathon is ready in under a minute. Everything for one event, from registration to certificates.</p>
          <div className="mt-8 inline-flex items-baseline gap-2 rounded-xl border border-line bg-surface px-6 py-4 shadow-sm">
            <span className="text-4xl font-bold tracking-tight text-ink">{priceLabel}</span>
            <span className="text-ink-soft">per hackathon · one-time</span>
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {INCLUDED.map((t) => (
              <li key={t} className="flex items-start gap-3 text-ink-soft">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ok-tint text-ok"><Icon name="check" className="size-4" /></span>{t}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-muted">Secure payment by Razorpay: UPI, cards and netbanking. You get a receipt by email from Razorpay.</p>
        </div>
        <Card className="p-6 sm:p-8">
          {session && !(session.profile.role === "admin" && !session.hackathonId) ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-ink">You&apos;re signed in</h2>
              <p className="text-sm text-ink-soft">Signed in as {session.email}. To create a new hackathon as an organiser, sign out and sign up with your organiser email.</p>
              <LinkButton href={homePathFor(session.profile.role)} variant="secondary">Go to your dashboard</LinkButton>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-ink">Create your organiser account</h2>
              <p className="mt-1 mb-6 text-sm text-muted">Step 1 of 2 · next you pay {priceLabel} and your hackathon is created.</p>
              {!ready && <div className="mb-4"><Alert tone="amber" title="Payments are not switched on yet">Online payment is being set up. <Link href="/" className="underline">Contact us</Link> to start a hackathon in the meantime.</Alert></div>}
              <StartForm priceLabel={priceLabel} />
            </>
          )}
        </Card>
      </section>
    </PublicShell>
  );
}
