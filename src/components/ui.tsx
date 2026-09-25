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
  primary:
    "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-900/30 hover:from-blue-500 hover:to-violet-500",
  secondary: "border border-navy-600 bg-navy-800 text-slate-100 hover:bg-navy-700",
  danger: "border border-red-500/40 bg-red-600/15 text-red-200 hover:bg-red-600/25",
  success: "border border-emerald-500/40 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25",
  ghost: "text-slate-300 hover:bg-navy-800 hover:text-white",
};
const SIZES: Record<Size, string> = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
  "block w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 aria-[invalid=true]:border-red-400 disabled:opacity-60";

type FieldProps = { label: string; name: string; id?: string; error?: string; hint?: ReactNode; required?: boolean; className?: string };

/** `name` doubles as the element id unless an explicit `id` is given (needed when a name repeats on a page). */
function FieldShell({ label, name, error, hint, required, className, children }: Omit<FieldProps, "id"> & { children: ReactNode }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={name} className="block text-sm font-medium text-slate-200">
        {label}
        {required && <span className="ml-0.5 text-red-300" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p id={`${name}-hint`} className="text-xs text-slate-400">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="text-xs font-medium text-red-300" role="alert">
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
    <label className="flex items-start gap-3 text-sm text-slate-200">
      <input type="checkbox" name={name} className="mt-0.5 size-4 rounded border-navy-500 bg-navy-900 accent-violet-500" {...props} />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Layout & feedback
// ---------------------------------------------------------------------------
export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-2xl border border-navy-700 bg-navy-900/80 p-5 shadow-xl shadow-black/20 backdrop-blur", className)} {...props}>
      {children}
    </section>
  );
}

export function CardTitle({ children, actions, description }: { children: ReactNode; actions?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-white">{children}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
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
          <Link href={back.href} className="mb-2 inline-flex text-sm text-slate-400 hover:text-white">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = "neutral" | "blue" | "violet" | "green" | "amber" | "red";
const TONES: Record<Tone, string> = {
  neutral: "bg-slate-500/15 text-slate-300 ring-slate-400/25",
  blue: "bg-blue-500/15 text-blue-200 ring-blue-400/30",
  violet: "bg-violet-500/15 text-violet-200 ring-violet-400/30",
  green: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
  amber: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
  red: "bg-red-500/15 text-red-200 ring-red-400/30",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

export function Alert({ tone = "blue", title, children }: { tone?: "blue" | "green" | "amber" | "red"; title?: ReactNode; children?: ReactNode }) {
  const styles = {
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-100",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    red: "border-red-500/30 bg-red-500/10 text-red-100",
  }[tone];
  return (
    <div className={cx("rounded-xl border px-4 py-3 text-sm", styles)} role={tone === "red" ? "alert" : "status"}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title ? "mt-1" : "", "opacity-90")}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-600 px-6 py-12 text-center">
      <p className="font-semibold text-slate-200">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "blue" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "blue" | "violet" | "green" | "amber" }) {
  const bar = { blue: "from-blue-500", violet: "from-violet-500", green: "from-emerald-500", amber: "from-amber-500" }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-navy-700 bg-navy-900/80 p-4">
      <div className={cx("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent", bar)} />
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-100">{item.value ?? "—"}</dd>
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
    <div className="overflow-x-auto rounded-xl border border-navy-700">
      <table className="min-w-full divide-y divide-navy-700 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, ...props }: ComponentProps<"th">) {
  return (
    <th scope="col" className={cx("bg-navy-850 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-slate-400", className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ children, className, ...props }: ComponentProps<"td">) {
  return (
    <td className={cx("px-3 py-2.5 align-top text-slate-200", className)} {...props}>
      {children}
    </td>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400" aria-label="Pagination">
      <p>
        Showing <span className="text-slate-200">{from}</span>–<span className="text-slate-200">{to}</span> of <span className="text-slate-200">{total}</span>
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
