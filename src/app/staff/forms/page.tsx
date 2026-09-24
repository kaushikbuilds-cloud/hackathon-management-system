import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, Flash, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { RegistrationForm } from "@/lib/types";

export const metadata: Metadata = { title: "Form Builder" };

export default async function FormsPage(props: PageProps<"/staff/forms">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [{ data: forms }, { data: subs }] = await Promise.all([
    supabase.from("registration_forms").select("*").order("created_at", { ascending: false }).returns<RegistrationForm[]>(),
    supabase.from("registration_submissions").select("form_id, status").returns<{ form_id: string; status: string }[]>(),
  ]);
  const counts = (id: string, status: string) => (subs ?? []).filter((s) => s.form_id === id && s.status === status).length;
  return (
    <>
      <PageHeader title="Form Builder" description="Create, preview, publish and close registration forms." actions={<LinkButton href="/staff/forms/new">New form</LinkButton>} />
      <Flash notice={sp.notice} error={sp.error} />
      {!forms?.length ? (
        <EmptyState title="No registration forms" action={<LinkButton href="/staff/forms/new">Create a form</LinkButton>} />
      ) : (
        <Table caption="Registration forms">
          <thead><tr><Th>Title</Th><Th>Status</Th><Th>Public URL</Th><Th>Team size</Th><Th>Accepted</Th><Th>Rejected</Th><Th>Updated</Th></tr></thead>
          <tbody className="divide-y divide-navy-800">
            {forms.map((f) => (
              <tr key={f.id}>
                <Td><Link href={`/staff/forms/${f.id}`} className="font-medium text-blue-300 hover:underline">{f.title}</Link></Td>
                <Td><Badge tone={f.status === "published" ? "green" : f.status === "closed" ? "red" : "neutral"}>{f.status}</Badge></Td>
                <Td className="font-mono text-xs break-all">{appUrl()}/register/{f.slug}</Td>
                <Td>{f.min_team_size}–{f.max_team_size}</Td>
                <Td className="tabular-nums">{counts(f.id, "accepted")}</Td>
                <Td className="tabular-nums">{counts(f.id, "rejected")}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(f.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
