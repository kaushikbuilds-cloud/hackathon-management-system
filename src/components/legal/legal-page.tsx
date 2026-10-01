import type { ReactNode } from "react";
import { PublicShell } from "@/components/layout/public-shell";
import { PLATFORM } from "@/lib/platform";

export const LEGAL_UPDATED = "1 October 2026";

/** Frame for the platform's policy pages: title, last-updated date and readable prose. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {LEGAL_UPDATED}</p>
        <div className="mt-8 space-y-6 text-ink-soft [&_a]:font-semibold [&_a]:text-grass [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </article>
    </PublicShell>
  );
}

/** The business's contact block, used on Contact and at the end of each policy. */
export function BusinessContact() {
  return (
    <ul>
      <li>Business: <strong className="text-ink">{PLATFORM.legalName}</strong></li>
      <li>Email: <a href={`mailto:${PLATFORM.contactEmail}`}>{PLATFORM.contactEmail}</a></li>
      {PLATFORM.phone && <li>Phone: <a href={`tel:${PLATFORM.phone.replace(/\s/g, "")}`}>{PLATFORM.phone}</a></li>}
      {PLATFORM.address && <li>Address: {PLATFORM.address}</li>}
    </ul>
  );
}
