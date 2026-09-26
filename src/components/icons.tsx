import type { SVGProps } from "react";

/**
 * Line icons (24px grid, 2px stroke, round joins) drawn as inline SVG so no
 * icon font or emoji is needed. Decorative by default (aria-hidden); pass a
 * `title` only when the icon is the sole label.
 */
const PATHS = {
  dashboard: "M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  form: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  table: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  idcard: "M3 5h18v14H3zM7 9h4v5H7zM14 10h4M14 14h3",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14h1",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6M20 6a8 8 0 0 1 0 12",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  chart: "M3 3v18h18M7 16v-5M12 16V8M17 16v-8",
  audit: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  server: "M2 3h20v7H2zM2 14h20v7H2zM6 6.5h.01M6 17.5h.01",
  calendar: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  menu: "M3 6h18M3 12h18M3 18h18",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  arrowRight: "M5 12h14M13 5l7 7-7 7",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  bag: "M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  food: "M4 3v7a3 3 0 0 0 3 3v8M10 3v7a3 3 0 0 1-3 3M7 3v6M17 21V3c-2 1-3.5 3.5-3.5 7s1.5 4 3.5 4",
  palette: "M12 22a10 10 0 1 1 10-10c0 3-2.5 4-4.5 4H15a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22zM7.5 11.5h.01M10.5 7.5h.01M15.5 7.5h.01M17.5 11.5h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, title, className, ...props }: { name: IconName; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-5 shrink-0"}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The HackathonBase mark: a code-bracket block with a lime notch. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <span className={`${className} bevel grid shrink-0 place-items-center rounded-md border-2 border-line bg-cobalt text-white`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
        <path d="M13.5 5l-3 14" stroke="var(--color-pop)" />
      </svg>
    </span>
  );
}
