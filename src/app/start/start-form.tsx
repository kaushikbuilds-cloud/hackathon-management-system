"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, TextField } from "@/components/ui";
import { startHackathon, type StartState } from "./actions";

export function StartForm({ priceLabel }: { priceLabel: string }) {
  const [state, action] = useActionState<StartState, FormData>(startHackathon, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Your name" name="full_name" id="s-name" required maxLength={100} autoComplete="name" defaultValue={v.full_name} />
        <TextField label="Phone (optional)" name="phone" id="s-phone" type="tel" maxLength={20} autoComplete="tel" defaultValue={v.phone} />
      </div>
      <TextField label="Email" name="email" id="s-email" type="email" required maxLength={254} autoComplete="email" defaultValue={v.email} hint="You'll sign in with this. Use your own email: you become the hackathon's Admin." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Password" name="password" id="s-pass" type="password" required minLength={10} maxLength={128} autoComplete="new-password" hint="At least 10 characters." />
        <TextField label="Confirm password" name="confirm" id="s-confirm" type="password" required maxLength={128} autoComplete="new-password" />
      </div>
      <TextField label="College, club or company" name="organisation" id="s-org" required maxLength={150} defaultValue={v.organisation} placeholder="e.g. Riverside Institute of Technology" />
      <TextField label="Hackathon name" name="hackathon_name" id="s-hack" required maxLength={120} defaultValue={v.hackathon_name} placeholder="e.g. InnovateX 2026" />
      <label className="flex items-start gap-3 text-sm text-ink-soft">
        <input type="checkbox" name="terms" required className="mt-1 size-4 accent-brand" />
        <span>I agree to pay {priceLabel} for this hackathon and to use HackGround OS responsibly.</span>
      </label>
      <SubmitButton pendingText="Creating your account…" className="w-full">Continue to payment</SubmitButton>
      <p className="text-center text-sm text-muted">Already started? <Link href="/login" className="font-medium text-grass hover:underline">Sign in</Link></p>
    </form>
  );
}
