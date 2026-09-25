"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Card, SelectField, TextArea, TextField } from "@/components/ui";
import { SUPPORT_CATEGORIES } from "@/lib/domain/support";
import { createSupportRequest, type SupportFormState } from "@/lib/support/actions";

export function NewRequestForm({ team, email }: { team: string; email: string }) {
  const [state, action] = useActionState<SupportFormState, FormData>(createSupportRequest, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <Card className="max-w-2xl">
      <form action={action} className="space-y-4" key={JSON.stringify(v)}>
        {state.error && <Alert tone="red">{state.error}</Alert>}
        <TextField label="Team" name="team_display" value={team} readOnly disabled />
        <SelectField label="Category" name="category" required defaultValue={v.category ?? "technical"} error={e.category}
          options={SUPPORT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
        <TextField label="Subject" name="subject" required maxLength={150} defaultValue={v.subject} error={e.subject} />
        <TextArea label="Description" name="description" required maxLength={5000} rows={5} defaultValue={v.description} error={e.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Contact email" name="contact_email" type="email" defaultValue={v.contact_email ?? email} error={e.contact_email} />
          <TextField label="Contact phone" name="contact_phone" type="tel" defaultValue={v.contact_phone} error={e.contact_phone} />
        </div>
        <div>
          <label htmlFor="attachment" className="block text-sm font-medium text-ink">Attachment (optional)</label>
          <input id="attachment" name="attachment" type="file" accept="image/png,image/jpeg,application/pdf,text/plain"
            className="mt-1 block text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-paper-2 file:px-3 file:py-1.5 file:text-ink" aria-describedby="attachment-hint" />
          <p id="attachment-hint" className="mt-1 text-xs text-muted">PNG, JPG, PDF or TXT, up to 5 MB.</p>
          {e.attachment && <p className="text-xs text-danger" role="alert">{e.attachment}</p>}
        </div>
        <SubmitButton pendingText="Submitting…">Submit request</SubmitButton>
      </form>
    </Card>
  );
}
