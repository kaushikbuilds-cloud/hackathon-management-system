"use client";

import { useActionState, useId, useState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Button, Card, SelectField, TextArea, TextField, buttonClass } from "@/components/ui";
import type { CustomQuestion, FieldConfig, RegistrationDraft } from "@/lib/domain/registration";
import { registerTeam, type RegisterState } from "./actions";

type Props = {
  slug: string;
  minMembers: number;
  maxMembers: number;
  fieldConfig: FieldConfig;
  questions: CustomQuestion[];
  disabled?: boolean;
};

const EMPTY_MEMBER = { full_name: "", email: "", phone: "", department: "", academic_year: "", college: "", role: "member" };

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function RegistrationFormClient({ slug, minMembers, maxMembers, fieldConfig, questions, disabled }: Props) {
  const [state, formAction] = useActionState<RegisterState, FormData>(registerTeam.bind(null, slug), { status: "idle" });
  const [idempotencyKey] = useState(newKey);

  if (state.status === "success" && state.result) {
    return (
      <Card>
        <div className="space-y-4" role="status" aria-live="polite">
          <Alert tone="green" title="Registration received!">
            Team <strong>{state.result.team_name}</strong> is registered. Keep these identifiers for your records.
          </Alert>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-navy-700 bg-navy-850 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Team ID</dt>
              <dd className="mt-1 font-mono text-xl font-bold text-white">{state.result.team_code}</dd>
            </div>
            <div className="rounded-xl border border-navy-700 bg-navy-850 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Participant IDs</dt>
              <dd className="mt-1 space-y-0.5 font-mono text-sm text-slate-100">
                {state.result.participant_codes.map((c) => <div key={c}>{c}</div>)}
              </dd>
            </div>
          </dl>
          {state.result.activation_url ? (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
              <p className="font-semibold text-white">Team Leader: activate your Team Portal account</p>
              <p className="mt-1 text-sm text-slate-300">This personal link works once and expires in 7 days. Open it now to set your password.</p>
              <a href={state.result.activation_url} className="mt-3 inline-flex rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white">Activate my account</a>
            </div>
          ) : null}
          <p className="text-sm text-slate-400">
            Other members receive their activation links from the organisers. ID cards are handed out at check-in.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <FormBody
      key={state.nonce ?? "initial"}
      state={state}
      formAction={formAction}
      idempotencyKey={idempotencyKey}
      minMembers={minMembers}
      maxMembers={maxMembers}
      fieldConfig={fieldConfig}
      questions={questions}
      disabled={disabled}
    />
  );
}

function FormBody({
  state, formAction, idempotencyKey, minMembers, maxMembers, fieldConfig, questions, disabled,
}: Omit<Props, "slug"> & { state: RegisterState; formAction: (fd: FormData) => void; idempotencyKey: string }) {
  const values: RegistrationDraft | undefined = state.values;
  const initialMembers = values?.members.length
    ? values.members
    : Array.from({ length: Math.max(minMembers, 1) }, (_, i) => ({ ...EMPTY_MEMBER, role: i === 0 ? "leader" : "member" }));
  const [rows, setRows] = useState(() => initialMembers.map((m) => ({ key: newKey(), initial: m })));
  const [leaderKey, setLeaderKey] = useState<string | undefined>(() => rows[Math.max(0, initialMembers.findIndex((m) => m.role === "leader"))]?.key);
  const errors = state.fieldErrors ?? {};
  const baseId = useId();

  const leaderIndex = Math.max(0, rows.findIndex((r) => r.key === leaderKey));

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <input type="hidden" name="member_count" value={rows.length} />
      <input type="hidden" name="leader_index" value={leaderIndex} />

      {state.status === "error" && state.message && (
        <Alert tone="red" title="Registration not submitted">{state.message}</Alert>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-white">Team details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Team name" name="team_name" required maxLength={80} defaultValue={values?.team_name} error={errors.team_name}
            hint="Must be unique. Letters, numbers, spaces and & ' . _ ! -" autoComplete="off" />
          <TextField label="College / institution" name="college" required maxLength={150} defaultValue={values?.college} error={errors.college} autoComplete="organization" />
        </div>
      </Card>

      <fieldset className="space-y-4">
        <legend className="sr-only">Team members</legend>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">
            Members <span className="text-sm font-normal text-slate-400">({rows.length} of {minMembers}–{maxMembers})</span>
          </h2>
          <Button type="button" variant="secondary" size="sm" disabled={rows.length >= maxMembers}
            onClick={() => setRows((r) => [...r, { key: newKey(), initial: { ...EMPTY_MEMBER } }])}>
            + Add member
          </Button>
        </div>
        {errors.members && <Alert tone="red">{errors.members}</Alert>}

        {rows.map((row, i) => {
          const e = (f: string) => errors[`members.${i}.${f}`];
          const name = (f: string) => `members.${i}.${f}`;
          return (
            <Card key={row.key} aria-labelledby={`${baseId}-m${i}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 id={`${baseId}-m${i}`} className="font-semibold text-white">
                  Member {i + 1} {i === leaderIndex && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-200">Team leader</span>}
                </h3>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="radio" name={`${baseId}-leader`} checked={i === leaderIndex} onChange={() => setLeaderKey(row.key)} className="accent-violet-500" />
                    Team leader
                  </label>
                  {rows.length > minMembers && (
                    <button type="button" className={buttonClass("ghost", "sm")}
                      onClick={() => {
                        setRows((r) => r.filter((x) => x.key !== row.key));
                        if (row.key === leaderKey) setLeaderKey(rows.find((x) => x.key !== row.key)?.key);
                      }}
                      aria-label={`Remove member ${i + 1}`}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Full name" name={name("full_name")} required maxLength={100} defaultValue={row.initial.full_name} error={e("full_name")} autoComplete="name" />
                <TextField label="Email" name={name("email")} type="email" required maxLength={254} defaultValue={row.initial.email} error={e("email")} autoComplete="email" />
                {fieldConfig.phone.enabled && (
                  <TextField label="Phone number" name={name("phone")} type="tel" required={fieldConfig.phone.required} maxLength={20} defaultValue={row.initial.phone} error={e("phone")} autoComplete="tel" placeholder="+91 90000 00000" />
                )}
                {fieldConfig.department.enabled && (
                  <TextField label="Department" name={name("department")} required={fieldConfig.department.required} maxLength={100} defaultValue={row.initial.department} error={e("department")} />
                )}
                {fieldConfig.academic_year.enabled && (
                  <TextField label="Academic year" name={name("academic_year")} required={fieldConfig.academic_year.required} maxLength={30} defaultValue={row.initial.academic_year} error={e("academic_year")} placeholder="e.g. 2nd Year" />
                )}
                {fieldConfig.college.enabled && (
                  <TextField label="College (if different)" name={name("college")} required={fieldConfig.college.required} maxLength={150} defaultValue={row.initial.college} error={e("college")} />
                )}
              </div>
            </Card>
          );
        })}
      </fieldset>

      {questions.length > 0 && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">Additional questions</h2>
          <div className="space-y-4">
            {questions.map((q) => {
              const fname = `answers.${q.id}`;
              const common = { label: q.label, name: fname, required: q.required, defaultValue: values?.answers[q.id] ?? "", error: errors[fname] };
              if (q.type === "textarea") return <TextArea key={q.id} {...common} maxLength={2000} />;
              if (q.type === "select")
                return <SelectField key={q.id} {...common} options={[{ value: "", label: "Select…" }, ...(q.options ?? []).map((o) => ({ value: o, label: o }))]} />;
              return <TextField key={q.id} {...common} maxLength={300} />;
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-xs text-slate-400">By registering you agree to the event code of conduct.</p>
        <SubmitButton disabled={disabled} pendingText="Submitting…">Submit registration</SubmitButton>
      </div>
    </form>
  );
}
