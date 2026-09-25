import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/client";
import { PdfBadge } from "@/components/status";
import { Alert, Badge, Card, CardTitle, Checkbox, EmptyState, Flash, PageHeader, SelectField, Stat, Table, Td, TextField, Th, buttonClass } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { CARD_SIZES, resolveTemplateConfig } from "@/lib/domain/template";
import { formatDateTime } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";
import type { IdCardTemplate, TeamOverview } from "@/lib/types";
import { publishTemplate } from "./actions";
import { BulkGenerate } from "./bulk-generate";

export const metadata: Metadata = { title: "ID Card Generation" };

export default async function IdCardsPage(props: PageProps<"/staff/id-cards">) {
  const session = await requirePermission("generate_pdf", "manage_event");
  const sp = await props.searchParams;
  // Read with the service client after the permission check: Officials holding
  // generate_pdf may not read participant rows directly.
  const supabase = createServiceClient();
  const [{ data: templates }, { data: teams }] = await Promise.all([
    supabase.from("id_card_templates").select("*").order("version", { ascending: false }).returns<IdCardTemplate[]>(),
    supabase.from("team_overview").select("id, name, team_code, pdf_status, member_count, status").order("team_code").returns<Pick<TeamOverview, "id" | "name" | "team_code" | "pdf_status" | "member_count" | "status">[]>(),
  ]);
  const active = templates?.find((t) => t.is_active);
  const config = resolveTemplateConfig(active?.config);
  const list = teams ?? [];
  const by = (s: string) => list.filter((t) => t.pdf_status === s).length;
  const pending = list.filter((t) => t.pdf_status !== "generated" && t.status !== "rejected" && t.member_count > 0);

  return (
    <>
      <PageHeader title="ID Card Generation" description="Single-sided portrait cards, one PDF per team, one card per member per page."
        actions={<a href="/api/id-cards/sample" target="_blank" rel="noopener" className={buttonClass("secondary")}>Preview sample card PDF</a>} />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Generated" value={by("generated")} tone="green" />
        <Stat label="Outdated" value={by("outdated")} tone="amber" />
        <Stat label="Not generated" value={by("not_generated")} />
        <Stat label="Failed" value={by("failed")} tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          <CardTitle description="Teams whose PDF is missing, outdated or failed (rejected teams excluded).">Needs generation</CardTitle>
          {can(session, "generate_pdf") && <BulkGenerate teams={pending.map((t) => ({ id: t.id, name: t.name }))} />}
          {pending.length === 0 ? (
            <EmptyState title="All team PDFs are up to date" />
          ) : (
            <div className="mt-4">
              <Table caption="Teams needing PDF generation">
                <thead><tr><Th>Team</Th><Th>Team ID</Th><Th>Members</Th><Th>Status</Th><Th>Action</Th></tr></thead>
                <tbody className="divide-y divide-navy-800">
                  {pending.map((t) => (
                    <tr key={t.id}>
                      <Td>{t.name}</Td>
                      <Td className="font-mono text-xs">{t.team_code}</Td>
                      <Td>{t.member_count}</Td>
                      <Td><PdfBadge status={t.pdf_status} /></Td>
                      <Td><Link href={`/staff/teams/${t.id}/id-cards`} className={buttonClass("secondary", "sm")}>Open</Link></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle description={active ? `Active: v${active.version} — ${active.name}` : "No active template"}>Card template</CardTitle>
            {!can(session, "manage_event") ? (
              <Alert tone="blue">Changing the template requires the Event settings permission.</Alert>
            ) : (
              <form action={publishTemplate} className="space-y-4">
                <TextField label="Version name" name="name" defaultValue={active?.name ?? "Default portrait card"} maxLength={100} />
                <SelectField label="Card size" name="cardSize" defaultValue={config.cardSize} options={Object.entries(CARD_SIZES).map(([v, s]) => ({ value: v, label: s.label }))} />
                <SelectField label="Page layout" name="pageLayout" defaultValue={config.pageLayout} options={[{ value: "card", label: "Page = card size (one card per page)" }, { value: "a4", label: "A4, card centred with crop marks" }]} />
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Header colour" name="headerColor" type="color" defaultValue={config.headerColor} />
                  <TextField label="Accent colour" name="accentColor" type="color" defaultValue={config.accentColor} />
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-200">Show on card</legend>
                  <Checkbox name="showPhoto" label="Photo (initials when no photo)" defaultChecked={config.showPhoto} />
                  <Checkbox name="showCollege" label="College" defaultChecked={config.showCollege} />
                  <Checkbox name="showDepartment" label="Department & year" defaultChecked={config.showDepartment} />
                  <Checkbox name="showEventDate" label="Event date" defaultChecked={config.showEventDate} />
                  <Checkbox name="showVenue" label="Venue" defaultChecked={config.showVenue} />
                </fieldset>
                <TextField label="Footer text" name="footerText" defaultValue={config.footerText} maxLength={80} />
                <TextField label="Additional info line" name="additionalInfo" defaultValue={config.additionalInfo} maxLength={120} hint="Optional, e.g. Wi-Fi SSID or help desk location. Never put passwords here." />
                <SubmitButton pendingText="Publishing…">Publish new version</SubmitButton>
              </form>
            )}
          </Card>
          <Card>
            <CardTitle>Version history</CardTitle>
            <ul className="space-y-2 text-sm">
              {(templates ?? []).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <span>v{t.version} — {t.name}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-400">{formatDateTime(t.created_at)} {t.is_active && <Badge tone="green">Active</Badge>}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
