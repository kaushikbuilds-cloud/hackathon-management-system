import Link from "next/link";
import { FaqList } from "@/components/faq";
import { SupportBadge } from "@/components/status";
import { EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { supportCategoryLabel } from "@/lib/domain/support";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Faq, SupportRequest } from "@/lib/types";

export default async function PortalSupportPage() {
  await requireParticipant();
  const supabase = await createClient();
  const hackathonId = (await getHackathon())?.id ?? "";
  const [{ data }, { data: faqs }] = await Promise.all([
    supabase.from("support_requests").select("*").order("updated_at", { ascending: false }).returns<SupportRequest[]>(),
    supabase.from("hackathon_faqs").select("*").eq("hackathon_id", hackathonId).eq("is_published", true).order("sort_order").order("created_at").returns<Faq[]>(),
  ]);
  const hackathon = await getHackathon();
  return (
    <>
      <PageHeader title="Help & Support" description="Check the answers below first. Still stuck? Raise a request and the organisers will reply here." actions={<LinkButton href="/portal/support/new">New request</LinkButton>} />
      {faqs && faqs.length > 0 && (
        <section aria-labelledby="faq-heading" className="mb-8">
          <h2 id="faq-heading" className="mb-3 text-lg font-bold text-ink">Frequently asked questions</h2>
          <FaqList items={faqs} />
        </section>
      )}
      <h2 className="mb-3 text-lg font-bold text-ink">Your team&apos;s requests</h2>
      {!data?.length ? (
        <EmptyState title="No requests yet" action={<LinkButton href="/portal/support/new" variant="secondary">Raise a request</LinkButton>}>
          Stuck on something? Organisers and officials will respond here.
        </EmptyState>
      ) : (
        <Table caption="Support requests">
          <thead><tr><Th>Subject</Th><Th>Category</Th><Th>Status</Th><Th>Last update</Th></tr></thead>
          <tbody className="divide-y divide-line-soft">
            {data.map((r) => (
              <tr key={r.id}>
                <Td><Link href={`/portal/support/${r.id}`} className="font-medium text-brand hover:underline">{r.subject}</Link></Td>
                <Td>{supportCategoryLabel(r.category)}</Td>
                <Td><SupportBadge status={r.status} /></Td>
                <Td>{formatDateTime(r.updated_at, hackathon?.timezone)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
