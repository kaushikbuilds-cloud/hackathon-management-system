"use client";

import { useActionState } from "react";
import { CopyButton, SubmitButton } from "@/components/client";
import { Alert, Card, CardTitle, Checkbox, SelectField, TextField } from "@/components/ui";
import type { OfficialPermissions } from "@/lib/types";
import { createStaff, resetStaff, type StaffCredentialState } from "./actions";

function TempPassword({ state }: { state: StaffCredentialState }) {
  if (state.error) return <Alert tone="red">{state.error}</Alert>;
  if (!state.tempPassword) return null;
  return (
    <Alert tone="amber" title={`Temporary password for ${state.forName}`}>
      <p className="my-2 flex flex-wrap items-center gap-2">
        <code className="rounded bg-navy-950 px-2 py-1 font-mono text-base text-white">{state.tempPassword}</code>
        <CopyButton value={state.tempPassword} />
      </p>
      <p>{state.message} Shown only once; they must change it at first sign-in.</p>
    </Alert>
  );
}

export function CreateStaffForm({ canCreateAdmin }: { canCreateAdmin: boolean }) {
  const [state, action] = useActionState<StaffCredentialState, FormData>(createStaff, {});
  return (
    <Card>
      <CardTitle description="Creates an individual account with a short-lived temporary password.">Add staff member</CardTitle>
      <form action={action} className="space-y-4">
        <TextField label="Full name" name="full_name" required maxLength={100} />
        <TextField label="Email" name="email" type="email" required maxLength={254} />
        <SelectField label="Role" name="role" defaultValue="official"
          options={[{ value: "official", label: "Official" }, ...(canCreateAdmin ? [{ value: "admin", label: "Admin" }] : [])]} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-200">Official permissions</legend>
          <PermissionChecks />
        </fieldset>
        <SubmitButton pendingText="Creating…">Create account</SubmitButton>
        <TempPassword state={state} />
      </form>
    </Card>
  );
}

export function PermissionChecks({ values }: { values?: Partial<Omit<OfficialPermissions, "profile_id">> }) {
  return (
    <>
      <Checkbox name="can_edit_registrations" label="Correct registrations & approve teams" defaultChecked={values?.can_edit_registrations} />
      <Checkbox name="can_generate_pdf" label="Generate / download team ID card PDFs" defaultChecked={values?.can_generate_pdf} />
      <Checkbox name="can_correct_attendance" label="Undo / correct attendance" defaultChecked={values?.can_correct_attendance} />
      <Checkbox name="can_manage_all_support" label="See & assign all support requests" defaultChecked={values?.can_manage_all_support} />
    </>
  );
}

export function ResetStaffPassword({ profileId }: { profileId: string }) {
  const [state, action] = useActionState<StaffCredentialState, FormData>(resetStaff.bind(null, profileId), {});
  return (
    <form action={action} className="space-y-2">
      <SubmitButton variant="secondary" size="sm" pendingText="Resetting…">Reset password</SubmitButton>
      <TempPassword state={state} />
    </form>
  );
}
