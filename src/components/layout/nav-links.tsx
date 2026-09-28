"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { NavItem } from "./nav";

export function NavLinks({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();
  // Highlight only the most specific matching item (e.g. /staff/attendance/manual, not /staff/attendance too).
  const matches = items.filter((i) => (i.href === root ? pathname === root : pathname === i.href || pathname.startsWith(`${i.href}/`)));
  const activeHref = matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="space-y-0.5">
      {items.map((item, i) => {
        const active = item.href === activeHref;
        const heading = item.group && item.group !== items[i - 1]?.group ? item.group : null;
        return (
          <Fragment key={item.href}>
            {heading && <li className="px-3 pt-4 pb-1 text-xs font-medium text-muted">{heading}</li>}
            <li>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  active ? "bg-brand font-semibold text-white shadow-brutal-sm" : "font-medium text-ink-soft hover:bg-paper-2 hover:text-ink",
                )}
              >
                <Icon name={item.icon} className="size-5 shrink-0" />
                {item.label}
              </Link>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
