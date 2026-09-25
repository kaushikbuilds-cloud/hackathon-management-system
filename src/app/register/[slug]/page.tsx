import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/layout/public-shell";
import { Alert, Card } from "@/components/ui";
import { formAvailability, getHackathonById } from "@/lib/data/event";
import { resolveCustomQuestions, resolveFieldConfig } from "@/lib/domain/registration";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { RegistrationForm } from "@/lib/types";
import { RegistrationFormClient } from "./registration-form";

export const dynamic = "force-dynamic";

async function loadForm(slug: string) {
  const supabase = await createClient();
  // RLS: anonymous users only see published forms; staff also see drafts (preview).
  const { data } = await supabase.from("registration_forms").select("*").eq("slug", slug).maybeSingle<RegistrationForm>();
  return data;
}

export async function generateMetadata(props: PageProps<"/register/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const form = await loadForm(slug);
  return { title: form?.title ?? "Registration" };
}

export default async function RegisterPage(props: PageProps<"/register/[slug]">) {
  const { slug } = await props.params;
  const form = await loadForm(slug);
  if (!form) notFound();
  const hackathon = await getHackathonById(form.hackathon_id);
  const availability = formAvailability(form);
  const isPreview = form.status !== "published";
  const tz = hackathon?.timezone ?? "UTC";

  return (
    <PublicShell hackathon={hackathon}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        {isPreview && (
          <div className="mb-6">
            <Alert tone="amber" title="Preview mode">
              This form is <strong>{form.status}</strong>. Only staff can see it and submissions are disabled.
            </Alert>
          </div>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-ink">{form.title}</h1>
        {form.description && <p className="mt-2 whitespace-pre-line text-muted">{form.description}</p>}
        <p className="mt-3 text-sm text-muted">
          Team size: {form.min_team_size}–{form.max_team_size} members
          {form.closes_at && <> · Closes {formatDateTime(form.closes_at, tz)}</>}
        </p>
        <div className="mt-8">
          {!availability.open && !isPreview ? (
            <Card>
              <Alert tone="amber" title="Registration unavailable">{availability.reason}</Alert>
            </Card>
          ) : (
            <RegistrationFormClient
              slug={form.slug}
              minMembers={form.min_team_size}
              maxMembers={form.max_team_size}
              fieldConfig={resolveFieldConfig(form.field_config)}
              questions={resolveCustomQuestions(form.custom_questions)}
              fee={form.fee_enabled && form.fee_amount && form.fee_upi_id
                ? { amount: Number(form.fee_amount), basis: form.fee_basis, upiId: form.fee_upi_id, payee: form.fee_payee_name, instructions: form.fee_instructions }
                : null}
              disabled={isPreview || !availability.open}
            />
          )}
        </div>
      </div>
    </PublicShell>
  );
}
