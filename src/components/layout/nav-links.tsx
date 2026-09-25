"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import type { NavItem } from "./nav";

export function NavLinks({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();
  // Highlight only the most specific matching item (e.g. /staff/attendance/manual, not /staff/attendance too).
  const matches = items.filter((i) => (i.href === root ? pathname === root : pathname === i.href || pathname.startsWith(`${i.href}/`)));
  const activeHref = matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-gradient-to-r from-blue-600/25 to-violet-600/25 font-semibold text-white ring-1 ring-inset ring-violet-500/30" : "text-slate-300 hover:bg-navy-800 hover:text-white",
              )}
            >
              <span aria-hidden="true" className="w-4 text-center text-slate-400">{item.icon}</span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
