import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, LogoMark } from "@/components/icons";
import { PixelIcon } from "@/components/pixel-icons";
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
    <nav aria-label={`${portalName} navigation`} className="flex h-full flex-col gap-5">
      <Link href={root} className="panel flex items-center gap-3 rounded-lg border-2 border-line p-3">
        <LogoMark />
        <span className="min-w-0">
          <span className="block truncate font-heading text-lg font-bold text-ink [text-shadow:2px_2px_0_var(--color-line)]">{eventName}</span>
          <span className="font-pixel mt-0.5 inline-block rounded-sm border-2 border-line bg-pop px-1.5 text-[11px] tracking-wide uppercase">{portalName}</span>
        </span>
      </Link>
      <NavLinks items={nav} root={root} />
      <form action="/auth/signout" method="post" className="mt-auto">
        <button type="submit" className="font-pixel bevel flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-line bg-paper-2 text-sm text-ink hover:bg-line-soft">
          <Icon name="logout" className="size-4" /> Sign out
        </button>
      </form>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[18rem_1fr]">
      <aside className="hidden border-r-4 border-line bg-surface/90 px-3 py-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">{sidebar}</aside>
      <div className="min-w-0">
        <header className="panel sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b-4 border-line px-4 lg:px-8">
          <details className="relative lg:hidden">
            <summary className="font-pixel bevel flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border-2 border-line bg-pop px-3 text-sm">
              <Icon name="menu" className="size-4" /> Menu
            </summary>
            <div className="absolute top-14 left-0 z-30 max-h-[80vh] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-md border-2 border-line bg-surface p-3 shadow-brutal-lg">{sidebar}</div>
          </details>
          <p className="font-pixel hidden text-lg text-ink [text-shadow:2px_2px_0_var(--color-line)] lg:block">{portalName}</p>
          <div className="flex items-center gap-2">
            {notificationsHref && (
              <Link href={notificationsHref} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="font-pixel relative inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-line bg-paper-2 px-3 text-sm text-ink bevel hover:bg-line-soft">
                <Icon name="bell" className="size-5" />
                <span className="hidden sm:inline">Notifications</span>
                {unread > 0 && <span className="grid min-w-6 place-items-center rounded-sm border-2 border-line bg-pink px-1 text-xs font-bold" aria-hidden="true">{unread}</span>}
              </Link>
            )}
            <div className="flex items-center gap-2 rounded-md border-2 border-line bg-paper-2 py-1 pr-3 pl-1 bevel">
              <span className="grid size-9 place-items-center rounded-sm border-2 border-line bg-cobalt" aria-hidden="true"><PixelIcon name="person" className="size-7" /></span>
              <span className="min-w-0 leading-tight">
                <span className="block max-w-24 truncate text-sm font-bold text-ink sm:max-w-40">{user.name}</span>
                <span className="font-pixel block text-xs text-muted">{user.roleLabel}</span>
              </span>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
