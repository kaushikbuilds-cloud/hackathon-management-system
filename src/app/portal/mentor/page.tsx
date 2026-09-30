import type { Metadata } from "next";
import { AutoRefresh, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Alert, Badge, Card, CardTitle, EmptyState, Flash, PageHeader, SelectField, TextArea, TextField } from "@/components/ui";
import { Icon } from "@/components/icons";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadMyTeam } from "@/lib/data/portal";
import { formatDateTime } from "@/lib/format";
import { MENTOR_STATUS, MENTOR_TOPICS, minutesBetween, renderedAt } from "@/lib/mentors";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { MentorRequest } from "@/lib/types";
import { askMentor, cancelMentorRequest } from "./actions";

export const metadata: Metadata = { title: "Mentor Help" };

/** The team asks for a mentor and follows its request (the page refreshes itself). */
export default async function PortalMentorPage(props: PageProps<"/portal/mentor">) {
  const session = await requireParticipant();
  const sp = await props.searchParams;
  const [hackathon, data, { data: requests }] = await Promise.all([
    getHackathon(),
    loadMyTeam(session.participantId, session.isTeamAccount),
    (await createClient()).from("mentor_requests").select("*").order("created_at", { ascending: false }).limit(10).returns<MentorRequest[]>(),
  ]);
  const now = renderedAt();
  const tz = hackathon?.timezone ?? "UTC";
  const list = requests ?? [];
  const current = list.find((r) => r.status === "waiting" || r.status === "helping");
  const service = createServiceClient();
  // Place in the queue (counts only) and the mentor's name.
  const [{ count: ahead }, { data: mentor }] = await Promise.all([
    current?.status === "waiting"
      ? service.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", current.hackathon_id).eq("status", "waiting").lt("created_at", current.created_at)
      : Promise.resolve({ count: 0 }),
    current?.mentor_id
      ? service.from("profiles").select("full_name").eq("id", current.mentor_id).maybeSingle<{ full_name: string | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const open = Boolean(hackathon?.mentor_desk_open);
  const approved = data?.team.status === "approved";
  const lastLocation = list.find((r) => r.location)?.location ?? "";

  return (
    <>
      <PageHeader title="Mentor Help" description="Stuck on something? Ask for a mentor and one will come to your team." actions={<AutoRefresh seconds={15} />} />
      <Flash notice={sp.notice} error={sp.error} />

      {current ? (
        <Card className="mb-6 ring-2 ring-brand/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-hover" aria-hidden="true"><Icon name="mentor" className="size-6" /></span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><Badge tone={MENTOR_STATUS[current.status].tone}>{MENTOR_STATUS[current.status].label}</Badge><Badge tone="violet">{current.topic}</Badge></p>
                <h2 className="mt-2 text-lg font-semibold text-ink">
                  {current.status === "helping"
                    ? `${mentor?.full_name || "A mentor"} is coming to help`
                    : ahead ? `${ahead} ${ahead === 1 ? "team is" : "teams are"} ahead of you` : "You're next in the queue"}
                </h2>
                <p className="mt-1 text-sm text-ink-soft">{current.details}</p>
                <p className="mt-1 text-xs text-muted">Asked {minutesBetween(current.created_at, now)} ago{current.location ? ` · ${current.location}` : ""}</p>
              </div>
            </div>
            <form action={cancelMentorRequest.bind(null, current.id)}>
              <ConfirmSubmit variant="secondary" size="sm" message="Cancel this request?">{current.status === "helping" ? "We're fine now" : "Cancel request"}</ConfirmSubmit>
            </form>
          </div>
        </Card>
      ) : !approved ? (
        <div className="mb-6"><Alert tone="amber" title="Available once your team is approved">Mentor help opens for approved teams.</Alert></div>
      ) : !open ? (
        <div className="mb-6"><Alert tone="amber" title="The mentor desk is closed">The organisers will open it during the hackathon.</Alert></div>
      ) : (
        <Card className="mb-6 max-w-2xl">
          <CardTitle description="Any team member can ask. Your team can have one open request at a time.">Ask for a mentor</CardTitle>
          <form action={askMentor} className="space-y-4">
            <SelectField label="What do you need help with?" name="topic" id="mentor-topic" required defaultValue=""
              options={[{ value: "", label: "Choose a topic" }, ...MENTOR_TOPICS.map((t) => ({ value: t, label: t }))]} />
            <TextArea label="What's the problem?" name="details" id="mentor-details" required minLength={5} maxLength={500} rows={3}
              placeholder="e.g. Our login API returns an error after deploying" hint="A sentence or two so the right mentor comes." />
            <TextField label="Where is your team sitting? (optional)" name="location" id="mentor-location" maxLength={80} defaultValue={lastLocation} placeholder="e.g. Lab 2, table 14" />
            <SubmitButton>Ask for a mentor</SubmitButton>
          </form>
        </Card>
      )}

      <h2 className="mb-3 text-base font-semibold text-ink">Your requests</h2>
      {list.length === 0 ? <EmptyState title="No requests yet">Requests your team makes appear here.</EmptyState> : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm">
              <span className="min-w-0"><span className="font-medium text-ink">{r.topic}</span> <span className="text-ink-soft">· {r.details}</span></span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted">{formatDateTime(r.created_at, tz)}<Badge tone={MENTOR_STATUS[r.status].tone}>{r.status === "helping" ? "Helping" : MENTOR_STATUS[r.status].label}</Badge></span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
