"use client";

import { useActionState, type ReactNode } from "react";
import { SubmitButton } from "@/components/client";
import { InviteLink } from "@/components/users/invite-link";
import { Alert, Card, CardTitle, TextField } from "@/components/ui";
import { inviteStaff, sendPasswordReset, type InviteState } from "./actions";

export function InviteStaffForm({ role, eventName, permissionFields }: { role: "admin" | "official"; eventName: string; permissionFields: ReactNode }) {
  const [state, action] = useActionState<InviteState, FormData>(inviteStaff.bind(null, role), {});
  const label = role === "admin" ? "Admin" : "Official";
  return (
    <Card>
      <CardTitle description="Creates a single-use invitation link. The invitee verifies by opening it, sets their own password, and gets only the access you choose.">
        Invite {label}
      </CardTitle>
      <form action={action} className="space-y-4" key={state.link ?? "form"}>
        {state.error && <Alert tone="red">{state.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" name="full_name" required maxLength={100} />
          <TextField label="Email" name="email" type="email" required maxLength={254} />
          <TextField label="Phone (optional)" name="phone" type="tel" maxLength={20} />
          <TextField label="Job title (optional)" name="job_title" maxLength={100} />
          {role === "official" && (
            <>
              <TextField label="Duty (optional)" name="duty" maxLength={150} placeholder="e.g. Registration desk check-in" />
              <TextField label="Station (optional)" name="station" maxLength={100} placeholder="e.g. Gate A" />
            </>
          )}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Permissions</legend>
          {permissionFields}
        </fieldset>
        <SubmitButton pendingText="Creating…">Create invitation</SubmitButton>
      </form>
      {state.link && (
        <div className="mt-4">
          <InviteLink link={state.link} email={state.email!} name={state.name} expiresAt={state.expiresAt!} purpose="account activation" eventName={eventName} />
        </div>
      )}
    </Card>
  );
}

export function ResetLinkButton({ profileId, eventName }: { profileId: string; eventName: string }) {
  const [state, action] = useActionState<InviteState, FormData>(sendPasswordReset.bind(null, profileId), {});
  return (
    <div className="space-y-2">
      <form action={action}><SubmitButton variant="secondary" size="sm" pendingText="Creating…">Create password reset link</SubmitButton></form>
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.link && <InviteLink link={state.link} email={state.email!} name={state.name} expiresAt={state.expiresAt!} purpose="password reset" eventName={eventName} />}
    </div>
  );
}
