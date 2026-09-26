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
    <ul className="space-y-1.5">
      {items.map((item, i) => {
        const active = item.href === activeHref;
        const heading = item.group && item.group !== items[i - 1]?.group ? item.group : null;
        return (
          <Fragment key={item.href}>
            {heading && <li className="font-pixel px-2 pt-3 pb-0.5 text-xs tracking-widest text-muted uppercase">{heading}</li>}
            <li>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "font-pixel flex min-h-11 items-center gap-2.5 rounded-md border-2 px-2.5 text-sm leading-tight transition-colors",
                  active
                    ? "bevel border-line bg-brand font-semibold text-white"
                    : "border-line/70 bg-paper-2/70 text-ink shadow-[inset_1px_1px_0_0_rgb(255_255_255/0.08)] hover:border-line hover:bg-line-soft",
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
