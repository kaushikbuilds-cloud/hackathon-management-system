"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, TextField } from "@/components/ui";
import { createFirstSuperAdmin, type SetupState } from "./actions";

export function SetupForm() {
  const [state, action] = useActionState<SetupState, FormData>(createFirstSuperAdmin, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <TextField label="Setup token" name="token" type="password" required autoComplete="off" hint="The SETUP_TOKEN value from the server environment." />
      <TextField label="Full name" name="full_name" required maxLength={100} autoComplete="name" />
      <TextField label="Email" name="email" type="email" required autoComplete="email" />
      <TextField label="Password" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
      <SubmitButton className="w-full" pendingText="Creating…">Create Super Admin</SubmitButton>
    </form>
  );
}
