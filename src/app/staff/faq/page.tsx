import type { Metadata } from "next";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { FaqList } from "@/components/faq";
import { Badge, Card, CardTitle, Checkbox, EmptyState, Flash, PageHeader, SelectField, TextArea, TextField } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Faq } from "@/lib/types";
import { addStarterFaqs, deleteFaq, saveFaq } from "./actions";

export const metadata: Metadata = { title: "FAQ" };

const AUDIENCE = [
  { value: "public", label: "Everyone (event page and team portal)" },
  { value: "participants", label: "Registered teams only (team portal)" },
];

export default async function FaqPage(props: PageProps<"/staff/faq">) {
  await requirePermission("publish_announcements");
  const sp = await props.searchParams;
  const { data: faqs } = await (await createClient()).from("hackathon_faqs").select("*")
    .order("sort_order").order("created_at").returns<Faq[]>();
  const list = faqs ?? [];
  const published = list.filter((f) => f.is_published);

  return (
    <>
      <PageHeader
        title="FAQ"
        description="Answer common questions once. Public answers appear on your event page; the rest in the team portal next to Help & Support."
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4" aria-labelledby="faq-edit">
          <h2 id="faq-edit" className="text-lg font-bold text-ink">Questions</h2>
          <Card>
            <CardTitle>Add a question</CardTitle>
            <FaqForm nextOrder={(list.at(-1)?.sort_order ?? 0) + 10} />
          </Card>
          {!list.length ? (
            <EmptyState
              title="No questions yet"
              action={<form action={addStarterFaqs}><SubmitButton variant="secondary">Add starter questions</SubmitButton></form>}
            >
              Start from six common questions (registration, fee, team login, food, what to bring) and edit the answers.
            </EmptyState>
          ) : list.map((f) => (
            <Card key={f.id}>
              <CardTitle
                description={[f.category, f.audience === "public" ? "Everyone" : "Teams only"].filter(Boolean).join(" · ")}
                actions={<Badge tone={f.is_published ? "green" : "amber"}>{f.is_published ? "Published" : "Draft"}</Badge>}
              >
                {f.question}
              </CardTitle>
              <details>
                <summary className="cursor-pointer text-sm font-bold text-brand">Edit</summary>
                <div className="mt-3"><FaqForm item={f} /></div>
                <form action={deleteFaq.bind(null, f.id)} className="mt-3">
                  <ConfirmSubmit variant="danger" size="sm" message="Delete this question?">Delete</ConfirmSubmit>
                </form>
              </details>
            </Card>
          ))}
        </section>
        <section className="space-y-4" aria-labelledby="faq-preview">
          <h2 id="faq-preview" className="text-lg font-bold text-ink">What teams see</h2>
          {published.length ? <FaqList items={published} /> : <p className="rounded-md border-2 border-dashed border-line p-4 text-sm text-muted">Published answers appear here.</p>}
        </section>
      </div>
    </>
  );
}

function FaqForm({ item, nextOrder = 10 }: { item?: Faq; nextOrder?: number }) {
  const p = item ? `faq-${item.id}-` : "faq-new-";
  return (
    <form action={saveFaq} className="space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField label="Question" name="question" id={`${p}q`} required maxLength={200} defaultValue={item?.question} placeholder="e.g. Is food provided?" />
      <TextArea label="Answer" name="answer" id={`${p}a`} required maxLength={3000} rows={4} defaultValue={item?.answer} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Category (optional)" name="category" id={`${p}c`} maxLength={40} defaultValue={item?.category ?? ""} placeholder="e.g. Food" />
        <SelectField label="Shown to" name="audience" id={`${p}aud`} defaultValue={item?.audience ?? "public"} options={AUDIENCE} />
        <TextField label="Order" name="sort_order" id={`${p}o`} type="number" min={0} max={9999} defaultValue={item?.sort_order ?? nextOrder} hint="Lower shows first." />
      </div>
      <Checkbox name="is_published" label="Published" defaultChecked={item ? item.is_published : true} />
      <SubmitButton size="sm">{item ? "Save" : "Add question"}</SubmitButton>
    </form>
  );
}
