"use client";

import { CopyButton } from "@/components/client";
import { Alert, buttonClass } from "@/components/ui";

/**
 * Shows a freshly created single-use link exactly once, with ways to hand it
 * over. The raw token is never stored, so it cannot be displayed again later.
 */
export function InviteLink({ link, email, name, expiresAt, purpose, eventName }: {
  link: string; email: string; name?: string; expiresAt: string; purpose: string; eventName: string;
}) {
  const expires = new Date(expiresAt).toLocaleString();
  const subject = `${eventName}: your ${purpose} link`;
  const body = `Hi ${name || ""},\n\nUse this personal, single-use link to ${purpose === "password reset" ? "set a new password" : "activate your account"} for ${eventName}:\n\n${link}\n\nThe link expires on ${expires}. Do not share it.\n`;
  return (
    <Alert tone="green" title={`Link created for ${email}`}>
      <p className="mt-2 break-all rounded-lg bg-paper p-2 font-mono text-xs text-ink">{link}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={link} label="Copy link" />
        <a className={buttonClass("secondary", "sm")} href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Send by email</a>
        <a className={buttonClass("secondary", "sm")} href={`https://wa.me/?text=${encodeURIComponent(body)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
      </div>
      <p className="mt-2 text-xs">Single use · expires {expires}. It is shown only now; create a new one if it gets lost.</p>
    </Alert>
  );
}
