import { SubmitButton } from "@/components/client";
import { SupportBadge } from "@/components/status";
import { Badge, Card, CardTitle, Checkbox, DescriptionList, TextArea } from "@/components/ui";
import { supportCategoryLabel, supportStatusLabel } from "@/lib/domain/support";
import { formatDateTime } from "@/lib/format";
import { replyToRequest } from "@/lib/support/actions";
import type { SupportMessage, SupportRequest } from "@/lib/types";

type Author = { id: string; full_name: string | null; role: string };
type HistoryRow = { id: string; from_status: string | null; to_status: string; created_at: string };

export function SupportThread({
  request, messages, authors, history, teamLabel, timeZone, staffView,
}: {
  request: SupportRequest; messages: SupportMessage[]; authors: Author[]; history: HistoryRow[]; teamLabel: string; timeZone: string; staffView: boolean;
}) {
  const byId = new Map(authors.map((a) => [a.id, a]));
  const closed = request.status === "closed";
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card>
          <CardTitle actions={<SupportBadge status={request.status} />}>{request.subject}</CardTitle>
          <DescriptionList items={[
            { label: "Team", value: teamLabel },
            { label: "Category", value: supportCategoryLabel(request.category) },
            { label: "Created", value: formatDateTime(request.created_at, timeZone) },
            { label: "Contact", value: [request.contact_email, request.contact_phone].filter(Boolean).join(" · ") || "—" },
          ]} />
          <p className="mt-4 whitespace-pre-wrap rounded-md bg-paper p-4 text-sm text-ink">{request.description}</p>
          {request.attachment_path && (
            <p className="mt-3 text-sm"><a className="text-grass underline" href={`/api/support/${request.id}/attachment`}>Download attachment</a></p>
          )}
        </Card>

        <Card>
          <CardTitle>Conversation</CardTitle>
          {messages.length === 0 ? (
            <p className="text-sm text-muted">No replies yet.</p>
          ) : (
            <ol className="space-y-3">
              {messages.map((m) => {
                const author = m.author_id ? byId.get(m.author_id) : undefined;
                const fromStaff = author && author.role !== "participant";
                return (
                  <li key={m.id} className={`rounded-md p-4 text-sm ${m.is_internal ? "border-2 border-line bg-warn-tint" : fromStaff ? "bg-brand-tint" : "bg-paper"}`}>
                    <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-ink">{author?.full_name ?? (fromStaff ? "Organiser" : "Team member")}</span>
                      {fromStaff && <Badge tone="violet">Staff</Badge>}
                      {m.is_internal && <Badge tone="amber">Internal note</Badge>}
                      <span>{formatDateTime(m.created_at, timeZone)}</span>
                    </p>
                    <p className="whitespace-pre-wrap text-ink">{m.body}</p>
                  </li>
                );
              })}
            </ol>
          )}
          {!closed && (
            <form action={replyToRequest.bind(null, request.id)} className="mt-4 space-y-3">
              <TextArea label="Reply" name="body" required maxLength={5000} rows={3} />
              {staffView && <Checkbox name="internal" label="Internal note (hidden from the team)" />}
              <SubmitButton size="sm" pendingText="Sending…">Send reply</SubmitButton>
            </form>
          )}
        </Card>
      </div>
      <Card>
        <CardTitle>Status history</CardTitle>
        <ol className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex justify-between gap-2">
              <span>{h.from_status ? `${supportStatusLabel(h.from_status as never)} → ` : ""}{supportStatusLabel(h.to_status as never)}</span>
              <span className="text-xs text-muted">{formatDateTime(h.created_at, timeZone)}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
