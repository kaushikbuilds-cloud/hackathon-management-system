import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "press bevel border-2 border-line bg-brand text-white hover:bg-brand-hover",
  secondary: "press bevel border-2 border-line bg-paper-2 text-ink hover:bg-line-soft",
  danger: "press bevel border-2 border-line bg-danger-strong text-white",
  success: "press bevel border-2 border-line bg-pop hover:bg-pop-hover",
  ghost: "border-2 border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink",
};
// md meets the 44px touch-target minimum; sm is for dense tables/toolbars.
const SIZES: Record<Size, string> = { sm: "min-h-9 px-3 text-xs", md: "min-h-11 px-4 text-sm" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "font-pixel inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
export const inputClass =
  "block min-h-11 w-full rounded-md border-2 border-line bg-paper px-3 py-2 text-base text-ink shadow-[inset_2px_2px_0_0_rgb(0_0_0/0.45)] placeholder:text-muted focus:border-pop aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-tint disabled:opacity-60 sm:text-sm";

type FieldProps = { label: string; name: string; id?: string; error?: string; hint?: ReactNode; required?: boolean; className?: string };

/** `name` doubles as the element id unless an explicit `id` is given (needed when a name repeats on a page). */
function FieldShell({ label, name, error, hint, required, className, children }: Omit<FieldProps, "id"> & { children: ReactNode }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={name} className="block text-sm font-bold text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p id={`${name}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="text-xs font-bold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(name: string, error?: string, hint?: ReactNode) {
  return error ? `${name}-error` : hint ? `${name}-hint` : undefined;
}

export function TextField({ label, name, id, error, hint, required, className, ...props }: FieldProps & Omit<ComponentProps<"input">, "name" | "id">) {
  const fid = id ?? name;
  return (
    <FieldShell label={label} name={fid} error={error} hint={hint} required={required} className={className}>
      <input id={fid} name={name} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy(fid, error, hint)} className={inputClass} {...props} />
    </FieldShell>
  );
}

export function TextArea({ label, name, id, error, hint, required, className, ...props }: FieldProps & Omit<ComponentProps<"textarea">, "name" | "id">) {
  const fid = id ?? name;
  return (
    <FieldShell label={label} name={fid} error={error} hint={hint} required={required} className={className}>
      <textarea id={fid} name={name} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy(fid, error, hint)} className={cx(inputClass, "min-h-24")} {...props} />
    </FieldShell>
  );
}

export function SelectField({
  label, name, id, error, hint, required, className, options, ...props
}: FieldProps & Omit<ComponentProps<"select">, "name" | "id"> & { options: { value: string; label: string }[] }) {
  const fid = id ?? name;
  return (
    <FieldShell label={label} name={fid} error={error} hint={hint} required={required} className={className}>
      <select id={fid} name={name} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy(fid, error, hint)} className={inputClass} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & Omit<ComponentProps<"input">, "name" | "type">) {
  // The input is nested in its label, so no id pairing is needed.
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
      <input type="checkbox" name={name} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand" {...props} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Layout & feedback
// ---------------------------------------------------------------------------
export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("panel min-w-0 rounded-lg border-2 border-line p-5", className)} {...props}>
      {children}
    </section>
  );
}

export function CardTitle({ children, actions, description }: { children: ReactNode; actions?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-ink">{children}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="font-pixel mb-2 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-ink-soft underline-offset-4 [text-shadow:1px_1px_0_var(--color-line)] hover:text-pop hover:underline">
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        )}
        <h1 className="text-3xl font-bold text-balance text-ink [text-shadow:3px_3px_0_var(--color-line)] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-ink-soft [text-shadow:1px_1px_0_var(--color-line)] sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = "neutral" | "blue" | "violet" | "green" | "amber" | "red";
const TONES: Record<Tone, string> = {
  neutral: "bg-paper-2",
  blue: "bg-sky-tint",
  violet: "bg-brand-tint",
  green: "bg-ok-tint",
  amber: "bg-warn-tint",
  red: "bg-danger-tint",
};

/** Status chip: ink text on a tinted block (the label, not the colour, carries the meaning). */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("font-pixel inline-flex items-center rounded-sm border-2 border-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink shadow-[inset_1px_1px_0_0_rgb(255_255_255/0.15)]", TONES[tone], className)}>{children}</span>;
}

export function Alert({ tone = "blue", title, children }: { tone?: "blue" | "green" | "amber" | "red"; title?: ReactNode; children?: ReactNode }) {
  const styles = {
    blue: "bg-sky-tint",
    green: "bg-ok-tint",
    amber: "bg-warn-tint",
    red: "bg-danger-tint",
  }[tone];
  return (
    <div className={cx("rounded-md border-2 border-line px-4 py-3 text-sm text-ink shadow-brutal-sm", styles)} role={tone === "red" ? "alert" : "status"}>
      {title && <p className="font-bold">{title}</p>}
      {children && <div className={cx(title ? "mt-1" : "", "text-ink-soft")}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-wood-light bg-surface/85 px-6 py-12 text-center">
      <p className="font-heading text-lg font-bold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const STAT_ICON_BG = { blue: "bg-cobalt", violet: "bg-violet", green: "bg-brand", amber: "bg-warn-tint" } as const;

/** Stat tile: a wooden panel with an optional pixel icon block, like a game HUD counter. */
export function Stat({ label, value, hint, tone = "blue", icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "blue" | "violet" | "green" | "amber"; icon?: ReactNode }) {
  return (
    <div className="panel flex items-center gap-3 rounded-lg border-2 border-line p-4">
      {icon && <div className={cx("grid size-14 shrink-0 place-items-center rounded-md border-2 border-line bevel", STAT_ICON_BG[tone])} aria-hidden="true">{icon}</div>}
      <div className="min-w-0">
        <p className="font-pixel text-sm text-ink-soft">{label}</p>
        <p className="font-heading text-3xl font-bold text-ink tabular-nums [text-shadow:2px_2px_0_var(--color-line)]">{value}</p>
        {hint && <p className="mt-0.5 text-xs font-medium text-grass [&_a]:font-bold [&_a]:text-grass">{hint}</p>}
      </div>
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-bold tracking-wide text-muted uppercase">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-md border-2 border-line bg-surface shadow-brutal">
      <table className="min-w-full divide-y-2 divide-line text-sm [&_tbody>tr]:border-b [&_tbody>tr]:border-line-soft [&_tbody>tr:nth-child(even)]:bg-paper-2/40 [&_tbody>tr:hover]:bg-paper-2">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, ...props }: ComponentProps<"th">) {
  return (
    <th scope="col" className={cx("font-pixel bg-paper-2 px-3 py-3 text-left text-sm font-semibold whitespace-nowrap text-ink", className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ children, className, ...props }: ComponentProps<"td">) {
  return (
    <td className={cx("px-3 py-3 align-top text-ink", className)} {...props}>
      {children}
    </td>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft [text-shadow:1px_1px_0_var(--color-line)]" aria-label="Pagination">
      <p>
        Showing <span className="font-bold text-ink">{from}</span>–<span className="font-bold text-ink">{to}</span> of <span className="font-bold text-ink">{total}</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? <LinkButton variant="secondary" size="sm" href={hrefFor(page - 1)}>Previous</LinkButton> : <span className={buttonClass("secondary", "sm", "opacity-40")} aria-disabled="true">Previous</span>}
        <span className="self-center">Page {page} of {pages}</span>
        {page < pages ? <LinkButton variant="secondary" size="sm" href={hrefFor(page + 1)}>Next</LinkButton> : <span className={buttonClass("secondary", "sm", "opacity-40")} aria-disabled="true">Next</span>}
      </div>
    </nav>
  );
}

/** Flash message passed through the URL (?notice= / ?error=) after a redirecting action. */
export function Flash({ notice, error }: { notice?: string | string[]; error?: string | string[] }) {
  const n = Array.isArray(notice) ? notice[0] : notice;
  const e = Array.isArray(error) ? error[0] : error;
  if (!n && !e) return null;
  return (
    <div className="mb-5">
      {n && <Alert tone="green">{n.slice(0, 300)}</Alert>}
      {e && <Alert tone="red">{e.slice(0, 300)}</Alert>}
    </div>
  );
}
