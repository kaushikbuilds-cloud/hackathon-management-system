"use client";

import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";

/** Submit button that shows a pending state while its form's action runs. */
export function SubmitButton({
  children, pendingText, variant = "primary", size = "md", className, ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: "primary" | "secondary" | "danger" | "ghost" | "success"; size?: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden="true" />}
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}

/** Submit button that asks for confirmation first (destructive actions). */
export function ConfirmSubmit({ message, children, ...props }: ComponentProps<typeof SubmitButton> & { message: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </SubmitButton>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** Auto-submits the surrounding GET form when a select changes (filters). */
export function AutoSubmitSelect({ children, ...props }: ComponentProps<"select"> & { children: ReactNode }) {
  return (
    <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {children}
    </select>
  );
}

/**
 * Keeps a server-rendered list current: re-fetches every `seconds` while the
 * tab is visible, and immediately when the tab regains focus. New
 * registrations appear without anyone pressing reload.
 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [router, seconds]);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border-2 border-line bg-pop px-2 py-0.5 text-xs font-bold text-ink" title={`Updates automatically every ${seconds} seconds`}>
      <span className="size-2 animate-pulse rounded-full bg-ok" aria-hidden="true" />Live
    </span>
  );
}
