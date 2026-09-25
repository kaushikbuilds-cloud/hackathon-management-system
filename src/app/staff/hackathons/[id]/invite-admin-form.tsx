"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { InviteLink } from "@/components/users/invite-link";
import { Alert, TextField } from "@/components/ui";
import { inviteHackathonAdmin, type InviteAdminState } from "../actions";

export function InviteAdminForm({ hackathonId, eventName }: { hackathonId: string; eventName: string }) {
  const [state, action] = useActionState<InviteAdminState, FormData>(inviteHackathonAdmin.bind(null, hackathonId), {});
  return (
    <div className="space-y-4">
      {state.invite && (
        <InviteLink link={state.invite.link} email={state.invite.email} name={state.invite.name} expiresAt={state.invite.expiresAt} purpose="account activation" eventName={eventName} />
      )}
      <form action={action} className="space-y-4" key={state.invite?.link ?? "form"}>
        {state.error && <Alert tone="red">{state.error}</Alert>}
        <TextField label="Admin name" name="admin_name" required maxLength={100} />
        <TextField label="Admin email" name="admin_email" type="email" required maxLength={254} />
        <SubmitButton pendingText="Creating…">Invite Admin</SubmitButton>
      </form>
    </div>
  );
}
