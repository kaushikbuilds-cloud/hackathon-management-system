"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { InviteLink } from "@/components/users/invite-link";
import { Alert } from "@/components/ui";
import { createParticipantLink, type LinkState } from "./actions";

/** Creates a single-use activation (or password reset) link for one participant. */
export function ParticipantLinkButton({ participantId, hasAccount, eventName }: { participantId: string; hasAccount: boolean; eventName: string }) {
  const [state, action] = useActionState<LinkState, FormData>(createParticipantLink.bind(null, participantId), {});
  return (
    <div className="space-y-2">
      <form action={action}>
        <SubmitButton variant="secondary" size="sm" pendingText="Creating…">{hasAccount ? "Create password reset link" : "Create activation link"}</SubmitButton>
      </form>
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.link && <InviteLink link={state.link} email={state.email!} name={state.name} expiresAt={state.expiresAt!} purpose={state.purpose!} eventName={eventName} />}
    </div>
  );
}
