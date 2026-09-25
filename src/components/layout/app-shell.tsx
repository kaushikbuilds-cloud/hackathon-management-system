import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, LogoMark } from "@/components/icons";
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
      <Link href={root} className="flex items-center gap-3 px-1">
        <LogoMark />
        <span className="min-w-0">
          <span className="block truncate font-heading text-base font-bold text-ink">{eventName}</span>
          <span className="mt-0.5 inline-block rounded-sm border-2 border-line bg-pop px-1.5 text-[11px] font-bold tracking-wide text-ink uppercase">{portalName}</span>
        </span>
      </Link>
      <NavLinks items={nav} root={root} />
      <div className="mt-auto rounded-md border-2 border-line bg-paper p-3">
        <p className="truncate text-sm font-bold text-ink">{user.name}</p>
        <p className="text-xs text-muted">{user.roleLabel}</p>
        <form action="/auth/signout" method="post" className="mt-2">
          <button type="submit" className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-bold text-ink underline-offset-4 hover:underline">
            <Icon name="logout" className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="hidden border-r-2 border-line bg-surface px-3 py-5 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">{sidebar}</aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b-2 border-line bg-surface px-4 lg:px-8">
          <details className="relative lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border-2 border-line bg-pop px-3 text-sm font-bold text-ink shadow-brutal-sm">
              <Icon name="menu" className="size-4" /> Menu
            </summary>
            <div className="absolute top-14 left-0 z-30 max-h-[80vh] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-md border-2 border-line bg-surface p-3 shadow-brutal-lg">{sidebar}</div>
          </details>
          <p className="hidden font-heading text-sm font-bold tracking-wide text-ink uppercase lg:block">{portalName}</p>
          {notificationsHref && (
            <Link href={notificationsHref} className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-transparent px-3 text-sm font-bold text-ink hover:border-line hover:bg-paper">
              <Icon name="bell" className="size-5" />
              <span>Notifications</span>
              {unread > 0 && <span className="grid min-w-6 place-items-center rounded-sm border-2 border-line bg-pink px-1 text-xs font-bold text-ink" aria-hidden="true">{unread}</span>}
              {unread > 0 && <span className="sr-only">{unread} unread</span>}
            </Link>
          )}
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
