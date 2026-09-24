import { notFound } from "next/navigation";
import { SupportThread } from "@/components/support-thread";
import { Flash, PageHeader } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadSupportThread } from "@/lib/support/load";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export default async function PortalSupportDetail(props: PageProps<"/portal/support/[id]">) {
  await requireParticipant();
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const thread = await loadSupportThread(await createClient(), id);
  if (!thread) notFound();
  // Only names/roles of the authors of messages this user can already see.
  const { data: authors } = thread.authorIds.length
    ? await createServiceClient().from("profiles").select("id, full_name, role").in("id", thread.authorIds).returns<{ id: string; full_name: string | null; role: string }[]>()
    : { data: [] };
  const hackathon = await getHackathon();
  return (
    <>
      <PageHeader back={{ href: "/portal/support", label: "Help & Support" }} title="Support request" />
      <Flash notice={sp.notice} error={sp.error} />
      <SupportThread
        request={thread.request}
        messages={thread.messages}
        authors={authors ?? []}
        history={thread.history}
        teamLabel={`${thread.request.teams?.name ?? ""} (${thread.request.teams?.team_code ?? ""})`}
        timeZone={hackathon?.timezone ?? "UTC"}
        staffView={false}
      />
    </>
  );
}
