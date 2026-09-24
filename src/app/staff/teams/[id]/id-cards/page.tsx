import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PdfBadge } from "@/components/status";
import { Alert, Badge, Card, CardTitle, DescriptionList, EmptyState, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { loadTeamCardContext } from "@/lib/id-cards";
import { CARD_SIZES } from "@/lib/domain/template";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { IdCardJob, Profile } from "@/lib/types";
import { CardPreview } from "./card-preview";
import { GeneratePanel } from "./generate-panel";

export const metadata: Metadata = { title: "ID card PDF" };

export default async function TeamIdCardsPage(props: PageProps<"/staff/teams/[id]/id-cards">) {
  await requirePermission("generate_pdf");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const ctx = await loadTeamCardContext(supabase, id);
  if (!ctx) notFound();
  const { data: last } = await supabase
    .from("id_card_jobs").select("*, profiles:generated_by(full_name, email)").eq("team_id", id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle<IdCardJob & { profiles: Pick<Profile, "full_name" | "email"> | null }>();
  const tz = ctx.hackathon.timezone;
  const size = CARD_SIZES[ctx.templateConfig.cardSize];
  const { errors, warnings } = ctx.validation;

  return (
    <>
      <PageHeader
        back={{ href: `/staff/teams/${id}`, label: ctx.team.name }}
        title="ID Card PDF"
        description="One single-sided portrait card per member, one card per page."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Summary</CardTitle>
            <DescriptionList
              items={[
                { label: "Team name", value: ctx.team.name },
                { label: "Team ID", value: <span className="font-mono">{ctx.team.team_code}</span> },
                { label: "Member count", value: ctx.members.length },
                { label: "PDF pages", value: ctx.members.length },
                { label: "Template version", value: ctx.template ? `v${ctx.template.version} — ${ctx.template.name}` : "None" },
                { label: "Card size", value: `${size.label}${ctx.templateConfig.pageLayout === "a4" ? ", centred on A4 with crop marks" : ", page = card"}` },
                { label: "PDF status", value: <PdfBadge status={ctx.team.pdf_status} /> },
                { label: "Last generated", value: last ? `${formatDateTime(last.created_at, tz)} by ${last.profiles?.full_name || last.profiles?.email || "unknown"} (${last.status})` : "Never" },
                { label: "File name", value: <span className="break-all font-mono text-xs">{ctx.fileName}</span> },
              ]}
            />
            {ctx.team.pdf_status === "outdated" && (
              <div className="mt-4"><Alert tone="amber" title="Outdated">Participant, team, event or template data changed since the last PDF. Regenerate before printing.</Alert></div>
            )}
            {last?.status === "failed" && last.error && (
              <div className="mt-4"><Alert tone="red" title="Last generation failed">{last.error}</Alert></div>
            )}
          </Card>

          {(errors.length > 0 || warnings.length > 0) && (
            <Card>
              <CardTitle>Data checks</CardTitle>
              <div className="space-y-3">
                {errors.length > 0 && (
                  <Alert tone="red" title="Fix these before generating">
                    <ul className="list-disc pl-5">{errors.map((e, i) => <li key={i}>{e.participantCode && <span className="font-mono">{e.participantCode}: </span>}{e.message}</li>)}</ul>
                  </Alert>
                )}
                {warnings.length > 0 && (
                  <Alert tone="amber" title="Missing optional data">
                    <ul className="list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
                  </Alert>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardTitle description="Layout preview of each card. Use “Preview PDF” for the exact print output.">Cards ({ctx.members.length})</CardTitle>
            {ctx.members.length === 0 ? (
              <EmptyState title="No members to print" />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4">
                {[...ctx.members]
                  .sort((a, b) => Number(b.role === "leader") - Number(a.role === "leader") || a.participant_code.localeCompare(b.participant_code))
                  .map((m, i) => (
                    <figure key={m.id}>
                      <CardPreview
                        eventName={ctx.hackathon.name}
                        organizer={ctx.hackathon.organizer_name ?? ctx.hackathon.tagline ?? ""}
                        member={m}
                        teamName={ctx.team.name}
                        teamCode={ctx.team.team_code}
                        config={ctx.templateConfig}
                      />
                      <figcaption className="mt-2 text-center text-xs text-slate-400">Page {i + 1} · <Badge>{m.role === "leader" ? "Leader" : "Member"}</Badge></figcaption>
                    </figure>
                  ))}
              </div>
            )}
          </Card>
        </div>
        <div>
          <GeneratePanel teamId={id} fileName={ctx.fileName} pageCount={ctx.members.length} blocked={errors.length > 0} hasGenerated={ctx.team.pdf_status !== "not_generated"} />
        </div>
      </div>
    </>
  );
}
