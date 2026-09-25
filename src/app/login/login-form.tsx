"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, TextField } from "@/components/ui";
import { signIn, type AuthState } from "@/app/auth/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="next" value={next} />
      <TextField label="Email or Participant ID" name="email" type="text" autoComplete="username" required defaultValue={state.email} placeholder="you@example.com or SAMPLE1-P0001" />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
