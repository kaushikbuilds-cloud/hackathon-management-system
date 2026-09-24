import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { NavItem } from "./nav";
import { NavLinks } from "./nav-links";

type Props = {
  portalName: string;
  eventName: string;
  nav: NavItem[];
  root: string;
  user: { name: string; roleLabel: string };
  unread?: number;
  notificationsHref?: string;
  children: ReactNode;
};

export function AppShell({ portalName, eventName, nav, root, user, unread = 0, notificationsHref, children }: Props) {
  const sidebar = (
    <nav aria-label={`${portalName} navigation`} className="flex h-full flex-col gap-6">
      <Link href={root} className="flex items-center gap-2 px-2 font-bold text-white">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-xs" aria-hidden="true">{"</>"}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm">{eventName}</span>
          <span className="block text-xs font-medium text-violet-300">{portalName}</span>
        </span>
      </Link>
      <NavLinks items={nav} root={root} />
      <div className="mt-auto border-t border-navy-800 pt-4">
        <p className="truncate px-2 text-sm font-semibold text-slate-100">{user.name}</p>
        <p className="px-2 text-xs text-slate-400">{user.roleLabel}</p>
        <form action="/auth/signout" method="post" className="mt-3 px-2">
          <button type="submit" className="text-sm text-slate-400 hover:text-white">Sign out</button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-navy-800 bg-navy-950/80 px-3 py-5 lg:block lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">{sidebar}</aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-navy-800 bg-navy-950/85 px-4 backdrop-blur lg:px-8">
          <details className="relative lg:hidden">
            <summary className="cursor-pointer list-none rounded-lg border border-navy-700 px-3 py-1.5 text-sm text-slate-200">Menu</summary>
            <div className="absolute left-0 top-11 z-30 max-h-[80vh] w-72 overflow-y-auto rounded-xl border border-navy-700 bg-navy-900 p-3 shadow-2xl">{sidebar}</div>
          </details>
          <p className="hidden text-sm text-slate-400 lg:block">{portalName}</p>
          {notificationsHref && (
            <Link href={notificationsHref} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-800 hover:text-white">
              Notifications
              {unread > 0 && <Badge tone="violet">{unread}</Badge>}
              {unread > 0 && <span className="sr-only">{unread} unread</span>}
            </Link>
          )}
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
