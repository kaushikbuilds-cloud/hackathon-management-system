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
  primary: "press border-2 border-line bg-brand text-white shadow-brutal hover:bg-brand-hover",
  secondary: "press border-2 border-line bg-surface text-ink shadow-brutal hover:bg-paper-2",
  danger: "press border-2 border-line bg-danger text-white shadow-brutal",
  success: "press border-2 border-line bg-pop text-ink shadow-brutal hover:bg-pop-hover",
  ghost: "border-2 border-transparent text-ink-soft hover:border-line hover:bg-surface hover:text-ink",
};
// md meets the 44px touch-target minimum; sm is for dense tables/toolbars.
const SIZES: Record<Size, string> = { sm: "min-h-9 px-3 text-xs", md: "min-h-11 px-4 text-sm" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed",
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
  "block min-h-11 w-full rounded-md border-2 border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted focus:shadow-brutal-sm aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-tint disabled:opacity-60 sm:text-sm";

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
    <section className={cx("rounded-lg border-2 border-line bg-surface p-5 shadow-brutal", className)} {...props}>
      {children}
    </section>
  );
}

export function CardTitle({ children, actions, description }: { children: ReactNode; actions?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-ink">{children}</h2>
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
          <Link href={back.href} className="mb-2 inline-flex min-h-8 items-center gap-1 text-sm font-bold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-balance text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-muted sm:text-base">{description}</p>}
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
  return <span className={cx("inline-flex items-center rounded-sm border-2 border-line px-2 py-0.5 text-xs font-bold whitespace-nowrap text-ink", TONES[tone], className)}>{children}</span>;
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
    <div className="rounded-lg border-2 border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      <p className="font-heading text-lg font-bold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "blue" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "blue" | "violet" | "green" | "amber" }) {
  const block = { blue: "bg-sky", violet: "bg-brand-tint", green: "bg-pop", amber: "bg-pink" }[tone];
  return (
    <div className={cx("rounded-lg border-2 border-line p-4 shadow-brutal", block)}>
      <p className="text-xs font-bold tracking-wide text-ink uppercase">{label}</p>
      <p className="mt-1 font-heading text-4xl font-bold text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs font-medium text-ink [&_a]:font-bold">{hint}</p>}
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
    <div className="overflow-x-auto rounded-md border-2 border-line bg-surface">
      <table className="min-w-full divide-y-2 divide-line text-sm [&_tbody>tr]:border-b [&_tbody>tr]:border-line-soft [&_tbody>tr:hover]:bg-paper">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, ...props }: ComponentProps<"th">) {
  return (
    <th scope="col" className={cx("bg-paper-2 px-3 py-3 text-left text-xs font-bold tracking-wide whitespace-nowrap text-ink uppercase", className)} {...props}>
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
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted" aria-label="Pagination">
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
