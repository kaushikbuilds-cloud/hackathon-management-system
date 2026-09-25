"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { NavItem } from "./nav";

export function NavLinks({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();
  // Highlight only the most specific matching item (e.g. /staff/attendance/manual, not /staff/attendance too).
  const matches = items.filter((i) => (i.href === root ? pathname === root : pathname === i.href || pathname.startsWith(`${i.href}/`)));
  const activeHref = matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-md border-2 px-3 text-sm font-medium transition-colors",
                active ? "border-line bg-brand font-bold text-white shadow-brutal-sm" : "border-transparent text-ink hover:border-line hover:bg-paper",
              )}
            >
              <Icon name={item.icon} className="size-5 shrink-0" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
