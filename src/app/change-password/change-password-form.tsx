"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, TextField } from "@/components/ui";
import { changePassword, type AuthState } from "@/app/auth/actions";

export function ChangePasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
      <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
      <SubmitButton className="w-full" pendingText="Saving…">Save password</SubmitButton>
    </form>
  );
}
