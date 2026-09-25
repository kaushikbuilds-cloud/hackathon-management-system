import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit, CopyButton, SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, Checkbox, EmptyState, Flash, LinkButton, PageHeader, Table, Td, TextArea, TextField, Th, inputClass } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formAvailability, getHackathon } from "@/lib/data/event";
import { appUrl } from "@/lib/env";
import { OPTIONAL_FIELD_LABEL, OPTIONAL_MEMBER_FIELDS, resolveCustomQuestions, resolveFieldConfig } from "@/lib/domain/registration";
import { formatDateTime, toLocalInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { RegistrationForm } from "@/lib/types";
import { setFormStatus, updateForm } from "../actions";

export const metadata: Metadata = { title: "Edit form" };

type Submission = { id: string; status: string; created_at: string; payload: { team_name?: string; member_count?: number }; errors: { code?: string; message?: string; fields?: string[] } | null; team_id: string | null };

export default async function EditFormPage(props: PageProps<"/staff/forms/[id]">) {
  const session = await requirePermission("manage_registrations");
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: form } = await supabase.from("registration_forms").select("*").eq("id", id).eq("hackathon_id", session.hackathonId).maybeSingle<RegistrationForm>();
  if (!form) notFound();
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  const { data: submissions } = await supabase.from("registration_submissions").select("*").eq("form_id", id).order("created_at", { ascending: false }).limit(50).returns<Submission[]>();
  const fields = resolveFieldConfig(form.field_config);
  const questions = resolveCustomQuestions(form.custom_questions);
  const rows = [...questions, ...Array.from({ length: 3 }, () => null)];
  const url = `${appUrl()}/register/${form.slug}`;
  const availability = formAvailability(form);

  return (
    <>
      <PageHeader
        back={{ href: "/staff/forms", label: "Form Builder" }}
        title={form.title}
        description={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={form.status === "published" ? "green" : form.status === "closed" ? "red" : "neutral"}>{form.status}</Badge>{!availability.open && form.status === "published" && <span className="text-warn">{availability.reason}</span>}</span>}
        actions={
          <>
            <LinkButton href={`/register/${form.slug}`} variant="secondary" target="_blank">Preview</LinkButton>
            {form.status !== "published" && <form action={setFormStatus.bind(null, id, "published")}><SubmitButton variant="success">Publish</SubmitButton></form>}
            {form.status === "published" && <form action={setFormStatus.bind(null, id, "draft")}><ConfirmSubmit variant="secondary" message="Unpublish this form? The public URL will stop accepting registrations.">Unpublish</ConfirmSubmit></form>}
            {form.status !== "closed" && <form action={setFormStatus.bind(null, id, "closed")}><ConfirmSubmit variant="danger" message="Close registration? No further submissions will be accepted.">Close</ConfirmSubmit></form>}
          </>
        }
      />
      <Flash notice={sp.notice} error={sp.error} />
      <Card className="mb-6">
        <CardTitle>Shareable public URL</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-paper px-3 py-2 text-sm break-all text-ink">{url}</code>
          <CopyButton value={url} label="Copy link" />
        </div>
      </Card>

      <form action={updateForm.bind(null, id)} className="space-y-6">
        <Card>
          <CardTitle>Settings</CardTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Title" name="title" required defaultValue={form.title} maxLength={150} />
            <TextField label="URL slug" name="slug" required defaultValue={form.slug} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
            <TextArea label="Description / instructions" name="description" defaultValue={form.description ?? ""} maxLength={5000} className="md:col-span-2" />
            <TextField label="Minimum team size" name="min_team_size" type="number" min={1} max={20} required defaultValue={form.min_team_size} />
            <TextField label="Maximum team size" name="max_team_size" type="number" min={1} max={20} required defaultValue={form.max_team_size} />
            <TextField label={`Opens (${tz})`} name="opens_at" type="datetime-local" defaultValue={toLocalInput(form.opens_at, tz)} hint="Leave blank to open as soon as published." />
            <TextField label={`Closes (${tz})`} name="closes_at" type="datetime-local" defaultValue={toLocalInput(form.closes_at, tz)} />
            <div className="md:col-span-2">
              <Checkbox name="requires_approval" defaultChecked={form.requires_approval} label="Require admin approval" hint="New teams start as Pending instead of Approved." />
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle description="Team name, college, and each member's full name and email are always collected and required.">Member fields</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {OPTIONAL_MEMBER_FIELDS.map((f) => (
              <fieldset key={f} className="rounded-md border-2 border-line p-3">
                <legend className="px-1 text-sm font-semibold text-ink">{OPTIONAL_FIELD_LABEL[f]}</legend>
                <div className="flex flex-wrap gap-4">
                  <Checkbox name={`field.${f}.enabled`} label="Collect" defaultChecked={fields[f].enabled} />
                  <Checkbox name={`field.${f}.required`} label="Required" defaultChecked={fields[f].required} />
                </div>
              </fieldset>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle description="Leave a label empty to remove a question. Select options are comma-separated.">Custom questions</CardTitle>
          <div className="space-y-3">
            {rows.map((q, i) => (
              <div key={q?.id ?? `new-${i}`} className="grid gap-3 rounded-md border-2 border-line p-3 md:grid-cols-[2fr_1fr_2fr_auto]">
                <input type="hidden" name={`q.${i}.id`} value={q?.id ?? ""} />
                <div>
                  <label htmlFor={`q-${i}-label`} className="text-xs text-muted">Question {q ? "" : "(new)"}</label>
                  <input id={`q-${i}-label`} name={`q.${i}.label`} defaultValue={q?.label ?? ""} className={inputClass} maxLength={200} />
                </div>
                <div>
                  <label htmlFor={`q-${i}-type`} className="text-xs text-muted">Type</label>
                  <select id={`q-${i}-type`} name={`q.${i}.type`} defaultValue={q?.type ?? "text"} className={inputClass}>
                    <option value="text">Short text</option>
                    <option value="textarea">Long text</option>
                    <option value="select">Dropdown</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`q-${i}-options`} className="text-xs text-muted">Options (dropdown only)</label>
                  <input id={`q-${i}-options`} name={`q.${i}.options`} defaultValue={q?.options?.join(", ") ?? ""} className={inputClass} placeholder="Option A, Option B" />
                </div>
                <div className="self-end pb-2"><Checkbox name={`q.${i}.required`} label="Required" defaultChecked={q?.required ?? false} /></div>
              </div>
            ))}
          </div>
        </Card>
        <div className="flex justify-end"><SubmitButton pendingText="Saving…">Save form</SubmitButton></div>
      </form>

      <Card className="mt-6">
        <CardTitle description="Latest 50 submissions, including rejected attempts and their validation errors.">Submissions</CardTitle>
        {!submissions?.length ? (
          <EmptyState title="No submissions yet" />
        ) : (
          <Table caption="Submissions">
            <thead><tr><Th>Time</Th><Th>Team name</Th><Th>Members</Th><Th>Result</Th><Th>Details</Th></tr></thead>
            <tbody className="divide-y divide-line-soft">
              {submissions.map((s) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(s.created_at, tz)}</Td>
                  <Td>{s.team_id ? <Link className="text-brand hover:underline" href={`/staff/teams/${s.team_id}`}>{s.payload?.team_name ?? "—"}</Link> : s.payload?.team_name ?? "—"}</Td>
                  <Td className="tabular-nums">{s.payload?.member_count ?? "—"}</Td>
                  <Td><Badge tone={s.status === "accepted" ? "green" : "red"}>{s.status}</Badge></Td>
                  <Td className="text-xs text-ink-soft">{s.errors ? s.errors.message ?? `${s.errors.code}${s.errors.fields ? `: ${s.errors.fields.join(", ")}` : ""}` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
