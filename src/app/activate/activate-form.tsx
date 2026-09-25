"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, TextField } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/domain/password";
import { activateAccount, type ActivateState } from "./actions";

export function ActivateForm() {
  const [state, action] = useActionState<ActivateState, FormData>(activateAccount, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <TextField label="Participant ID" name="participant_code" required maxLength={30} placeholder="e.g. SAMPLE1-P0001" defaultValue={state.participantCode} autoComplete="username" autoCapitalize="characters" />
      <TextField label="Activation code" name="code" required maxLength={30} placeholder="8 characters on your ID card" autoComplete="one-time-code" autoCapitalize="characters" />
      <TextField label="New password" name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={128} autoComplete="new-password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} />
      <TextField label="Confirm password" name="confirm" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={128} autoComplete="new-password" />
      <SubmitButton className="w-full" pendingText="Activating…">Activate account</SubmitButton>
    </form>
  );
}
