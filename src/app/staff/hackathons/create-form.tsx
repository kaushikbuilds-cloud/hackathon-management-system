"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { InviteLink } from "@/components/users/invite-link";
import { Alert, Card, CardTitle, TextField } from "@/components/ui";
import { createHackathon, type CreateHackathonState } from "./actions";

export function CreateHackathonForm() {
  const [state, action] = useActionState<CreateHackathonState, FormData>(createHackathon, {});
  return (
    <Card>
      <CardTitle description="Set up a hackathon for an organiser who contacted you, and invite their Admin. The Admin completes the event setup, forms and officials.">
        Create hackathon
      </CardTitle>
      {state.hackathon && (
        <div className="mb-4 space-y-3">
          <Alert tone="green" title={`${state.hackathon.name} created`}>
            Public page: <Link className="underline" href={`/h/${state.hackathon.slug}`}>/h/{state.hackathon.slug}</Link>. It stays in &quot;Setting up&quot; until you mark it Active.
          </Alert>
          {state.invite && (
            <InviteLink link={state.invite.link} email={state.invite.email} name={state.invite.name} expiresAt={state.invite.expiresAt} purpose="account activation" eventName={state.hackathon.name} />
          )}
        </div>
      )}
      <form action={action} className="space-y-4" key={state.hackathon?.id ?? "new"}>
        {state.error && <Alert tone="red">{state.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <TextField label="Hackathon name" name="name" required maxLength={120} placeholder="e.g. Campus Hackathon 2027" />
          <TextField label="Organising institution" name="organizer_name" maxLength={150} />
          <TextField label="Starts" name="starts_at" type="datetime-local" />
          <TextField label="Ends" name="ends_at" type="datetime-local" />
          <TextField label="Venue" name="venue" maxLength={200} />
          <TextField label="Time zone" name="timezone" defaultValue="Asia/Kolkata" maxLength={60} />
          <TextField label="Public contact email" name="contact_email" type="email" maxLength={254} />
        </div>
        <fieldset className="space-y-3 rounded-md border-2 border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink">Hackathon Admin (organiser)</legend>
          <p className="text-xs text-muted">They get a single-use link to set their password, with full Admin access to this hackathon only.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Admin name" name="admin_name" maxLength={100} />
            <TextField label="Admin email" name="admin_email" type="email" maxLength={254} />
          </div>
        </fieldset>
        <SubmitButton pendingText="Creating…">Create hackathon</SubmitButton>
      </form>
    </Card>
  );
}
