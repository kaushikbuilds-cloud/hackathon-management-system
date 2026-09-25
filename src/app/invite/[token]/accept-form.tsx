"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, TextField } from "@/components/ui";
import { acceptInvite, type AcceptState } from "./actions";

export function AcceptForm({ token, defaultName, reset }: { token: string; defaultName: string; reset: boolean }) {
  const [state, action] = useActionState<AcceptState, FormData>(acceptInvite.bind(null, token), {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {reset ? <input type="hidden" name="full_name" value={defaultName || "Account holder"} /> : (
        <TextField label="Full name" name="full_name" required maxLength={100} defaultValue={state.fullName ?? defaultName} autoComplete="name" />
      )}
      <TextField label="Password" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
      <TextField label="Confirm password" name="confirm" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
      <SubmitButton className="w-full" pendingText="Activating…">{reset ? "Save password" : "Activate account"}</SubmitButton>
    </form>
  );
}
