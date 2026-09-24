"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, TextField } from "@/components/ui";
import { requestPasswordReset, type AuthState } from "@/app/auth/actions";

export function ForgotForm() {
  const [state, action] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  if (state.message) return <Alert tone="green">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <SubmitButton className="w-full" pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
