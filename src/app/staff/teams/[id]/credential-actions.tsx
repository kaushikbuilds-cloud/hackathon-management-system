"use client";

import { useActionState } from "react";
import { CopyButton, SubmitButton } from "@/components/client";
import { Alert } from "@/components/ui";
import { issueTempPassword, sendActivation, type CredentialState } from "./actions";

/**
 * Credential controls for one participant. A temporary password is shown
 * once, in this component's state only — it is never stored or logged.
 */
export function CredentialActions({ participantId, hasAccount }: { participantId: string; hasAccount: boolean }) {
  const [tempState, tempAction] = useActionState<CredentialState, FormData>(issueTempPassword.bind(null, participantId), {});
  const [inviteState, inviteAction] = useActionState<CredentialState, FormData>(sendActivation.bind(null, participantId), {});
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={inviteAction}>
          <SubmitButton variant="secondary" size="sm" pendingText="Sending…">{hasAccount ? "Send reset email" : "Send activation email"}</SubmitButton>
        </form>
        <form action={tempAction}>
          <SubmitButton variant="secondary" size="sm" pendingText="Issuing…">{hasAccount ? "Reset temp password" : "Create account (temp password)"}</SubmitButton>
        </form>
      </div>
      {inviteState.error && <Alert tone="red">{inviteState.error}</Alert>}
      {inviteState.message && <Alert tone="green">{inviteState.message}</Alert>}
      {tempState.error && <Alert tone="red">{tempState.error}</Alert>}
      {tempState.tempPassword && (
        <Alert tone="amber" title={`Temporary password for ${tempState.forName}`}>
          <p className="my-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-navy-950 px-2 py-1 font-mono text-base text-white">{tempState.tempPassword}</code>
            <CopyButton value={tempState.tempPassword} />
          </p>
          <p>{tempState.message} It is shown only once — hand it over privately. Never print it on ID cards.</p>
        </Alert>
      )}
    </div>
  );
}
