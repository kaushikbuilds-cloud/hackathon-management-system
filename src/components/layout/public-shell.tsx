import Link from "next/link";
import type { ReactNode } from "react";
import { PLATFORM } from "@/lib/platform";
import type { Hackathon } from "@/lib/types";

/** Public page frame: a hackathon's branding, or the platform's when none is given. */
export function PublicShell({ children, hackathon = null }: { children: ReactNode; hackathon?: Hackathon | null }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-navy-800/80 bg-navy-950/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href={hackathon ? `/h/${hackathon.slug}` : "/"} className="flex items-center gap-2 font-bold text-white">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-sm" aria-hidden="true">
              {"</>"}
            </span>
            <span className="truncate">{hackathon?.name ?? PLATFORM.name}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/login" className="rounded-lg px-3 py-2 text-slate-300 hover:bg-navy-800 hover:text-white">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t border-navy-800/80 py-6 text-center text-xs text-slate-500">
        {hackathon?.organizer_name ? `Organised by ${hackathon.organizer_name}` : PLATFORM.name}
        {" · "}
        {hackathon?.contact_email ? (
          <a className="hover:text-slate-300" href={`mailto:${hackathon.contact_email}`}>{hackathon.contact_email}</a>
        ) : (
          <a className="hover:text-slate-300" href={`mailto:${PLATFORM.contactEmail}`}>Host your hackathon with us</a>
        )}
      </footer>
    </div>
  );
}
