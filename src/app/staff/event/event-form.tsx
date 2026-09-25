"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Card, CardTitle, Checkbox, TextArea, TextField } from "@/components/ui";
import type { Hackathon } from "@/lib/types";
import { saveEvent, type EventFormState } from "./actions";

type Initial = Omit<Hackathon, "starts_at" | "ends_at" | "registration_opens_at" | "registration_closes_at"> & {
  starts_at: string; ends_at: string; registration_opens_at: string; registration_closes_at: string;
};

export function EventForm({ initial: h }: { initial: Initial }) {
  const [state, action] = useActionState<EventFormState, FormData>(saveEvent, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-6">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.ok && <Alert tone="green">{state.message}</Alert>}
      <Card>
        <CardTitle>Hackathon</CardTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Hackathon name" name="name" required defaultValue={h.name} error={e.name} maxLength={120} />
          <TextField label="Tagline" name="tagline" defaultValue={h.tagline ?? ""} maxLength={200} />
          <TextArea label="Description" name="description" defaultValue={h.description ?? ""} maxLength={5000} className="md:col-span-2" />
          <TextField label="Organiser / institution" name="organizer_name" defaultValue={h.organizer_name ?? ""} maxLength={150} />
          <p className="self-end text-sm text-muted md:col-span-2">
            Logos and colours are in the <a href="/staff/brand" className="font-bold text-brand underline-offset-4 hover:underline">Brand Kit</a>; ID cards and your public pages use them.
          </p>
        </div>
      </Card>
      <Card>
        <CardTitle>Dates &amp; venue</CardTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Time zone (IANA)" name="timezone" required defaultValue={h.timezone} error={e.timezone} hint="e.g. Asia/Kolkata, Europe/London. Dates below are in this zone." />
          <TextField label="Venue" name="venue" defaultValue={h.venue ?? ""} maxLength={200} />
          <TextField label="Event starts" name="starts_at" type="datetime-local" defaultValue={h.starts_at} />
          <TextField label="Event ends" name="ends_at" type="datetime-local" defaultValue={h.ends_at} error={e.ends_at} />
          <TextField label="Registration opens (informational)" name="registration_opens_at" type="datetime-local" defaultValue={h.registration_opens_at} hint="Each form has its own enforced open/close window." />
          <TextField label="Registration closes (informational)" name="registration_closes_at" type="datetime-local" defaultValue={h.registration_closes_at} />
        </div>
      </Card>
      <Card>
        <CardTitle>Teams &amp; identifiers</CardTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="Default min team size" name="min_team_size" type="number" min={1} max={20} defaultValue={h.min_team_size} error={e.min_team_size} />
          <TextField label="Default max team size" name="max_team_size" type="number" min={1} max={20} defaultValue={h.max_team_size} error={e.max_team_size} />
          <TextField label="ID year" name="id_year" type="number" min={2000} max={2999} defaultValue={h.id_year} error={e.id_year} hint="Used in TEAM-YYYY-0001 / PRT-YYYY-0001. Locked once teams exist." />
        </div>
      </Card>
      <Card>
        <CardTitle>Contact &amp; support</CardTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Contact email" name="contact_email" type="email" defaultValue={h.contact_email ?? ""} error={e.contact_email} />
          <TextField label="Contact phone" name="contact_phone" defaultValue={h.contact_phone ?? ""} maxLength={30} />
          <TextArea label="Support instructions" name="support_instructions" defaultValue={h.support_instructions ?? ""} maxLength={2000} className="md:col-span-2" />
        </div>
      </Card>
      <Card>
        <CardTitle>Team Portal</CardTitle>
        <Checkbox name="portal_id_cards" defaultChecked={h.portal_id_cards} label="Let participants download ID cards in the Team Portal"
          hint="Each participant gets their own card; the Team Leader can also download the whole team's PDF. Turn on once cards are final." />
      </Card>
      <div className="flex justify-end"><SubmitButton pendingText="Saving…">Save event settings</SubmitButton></div>
    </form>
  );
}
