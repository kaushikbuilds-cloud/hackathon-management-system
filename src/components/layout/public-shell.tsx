import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { brandingUrls } from "@/lib/data/event";
import { PLATFORM } from "@/lib/platform";
import type { Hackathon } from "@/lib/types";

/** Public page frame: a hackathon's branding, or the platform's when none is given. */
export function PublicShell({ children, hackathon = null }: { children: ReactNode; hackathon?: Hackathon | null }) {
  const logo = hackathon ? brandingUrls(hackathon).logo : null;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-2 border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href={hackathon ? `/h/${hackathon.slug}` : "/"} className="flex min-w-0 items-center gap-3 font-heading text-lg font-bold text-ink">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-10 shrink-0 rounded-md border-2 border-line bg-surface object-contain p-0.5" />
            ) : (
              <LogoMark />
            )}
            <span className="truncate">{hackathon?.name ?? PLATFORM.name}</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm" aria-label="Site">
            <Link href="/login" className={buttonClass("secondary", "sm")}>Sign in</Link>
          </nav>
        </div>
      </header>
      {hackathon && (
        // The hackathon's brand colours (Brand Kit) as a stripe under the header.
        <div className="flex h-2.5 border-b-2 border-line" aria-hidden="true">
          <span className="flex-[3]" style={{ background: hackathon.primary_color }} />
          <span className="flex-1" style={{ background: hackathon.accent_color }} />
        </div>
      )}
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t-2 border-line bg-surface py-6 text-center text-sm text-ink-soft">
        <span className="font-bold text-ink">{hackathon?.organizer_name ? `Organised by ${hackathon.organizer_name}` : PLATFORM.name}</span>
        {" · "}
        {hackathon?.contact_email ? (
          <a className="font-bold text-brand underline-offset-4 hover:underline" href={`mailto:${hackathon.contact_email}`}>{hackathon.contact_email}</a>
        ) : (
          <a className="font-bold text-brand underline-offset-4 hover:underline" href={`mailto:${PLATFORM.contactEmail}`}>Host your hackathon with us</a>
        )}
      </footer>
    </div>
  );
}
