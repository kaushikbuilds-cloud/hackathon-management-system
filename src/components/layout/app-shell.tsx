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
    <nav aria-label={`${portalName} navigation`} className="flex h-full flex-col gap-4">
      <Link href={root} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-paper-2">
        <LogoMark />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{eventName}</span>
          <span className="block text-xs text-muted">{portalName}</span>
        </span>
      </Link>
      <NavLinks items={nav} root={root} />
      <form action="/auth/signout" method="post" className="mt-auto border-t border-line pt-3">
        <button type="submit" className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-sm font-medium text-ink-soft hover:bg-paper-2 hover:text-ink">
          <Icon name="logout" className="size-5" /> Sign out
        </button>
      </form>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-line bg-surface px-3 py-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">{sidebar}</aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-4 lg:px-8">
          <details className="relative lg:hidden">
            <summary className="flex min-h-11 shrink-0 cursor-pointer list-none items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-brutal-sm">
              <Icon name="menu" className="size-4" /> Menu
            </summary>
            <div className="absolute top-14 left-0 z-30 max-h-[80vh] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-brutal-lg">{sidebar}</div>
          </details>
          <p className="hidden text-sm font-medium text-muted lg:block">{portalName}</p>
          <div className="flex min-w-0 items-center gap-2">
            {notificationsHref && (
              <Link href={notificationsHref} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-soft hover:bg-paper-2 hover:text-ink">
                <Icon name="bell" className="size-5" />
                <span className="hidden sm:inline">Notifications</span>
                {unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-danger-strong px-1.5 text-xs font-semibold text-white" aria-hidden="true">{unread}</span>}
              </Link>
            )}
            <div className="flex min-w-0 items-center gap-2 border-l border-line pl-3">
              <Avatar name={user.name} />
              <span className="min-w-0 leading-tight">
                <span className="block max-w-24 truncate text-sm font-semibold text-ink sm:max-w-40">{user.name}</span>
                <span className="block text-xs text-muted">{user.roleLabel}</span>
              </span>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

/** Initials avatar, e.g. "Asha Admin" → "AA". */
function Avatar({ name, className = "size-9 text-sm" }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return <span className={`grid shrink-0 place-items-center rounded-full bg-brand-tint font-semibold text-brand-hover ${className}`} aria-hidden="true">{initials}</span>;
}
