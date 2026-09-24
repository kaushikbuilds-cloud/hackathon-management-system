import Link from "next/link";
import { SupportBadge } from "@/components/status";
import { EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { supportCategoryLabel } from "@/lib/domain/support";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SupportRequest } from "@/lib/types";

export default async function PortalSupportPage() {
  await requireParticipant();
  const supabase = await createClient();
  const { data } = await supabase.from("support_requests").select("*").order("updated_at", { ascending: false }).returns<SupportRequest[]>();
  const hackathon = await getHackathon();
  return (
    <>
      <PageHeader title="Help & Support" description="Requests raised by your team." actions={<LinkButton href="/portal/support/new">New request</LinkButton>} />
      {!data?.length ? (
        <EmptyState title="No requests yet" action={<LinkButton href="/portal/support/new" variant="secondary">Raise a request</LinkButton>}>
          Stuck on something? Organisers and officials will respond here.
        </EmptyState>
      ) : (
        <Table caption="Support requests">
          <thead><tr><Th>Subject</Th><Th>Category</Th><Th>Status</Th><Th>Last update</Th></tr></thead>
          <tbody className="divide-y divide-navy-800">
            {data.map((r) => (
              <tr key={r.id}>
                <Td><Link href={`/portal/support/${r.id}`} className="font-medium text-blue-300 hover:underline">{r.subject}</Link></Td>
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
