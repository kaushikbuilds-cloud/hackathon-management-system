import type { Metadata } from "next";
import { SubmitButton } from "@/components/client";
import { Alert, Badge, Card, CardTitle, Checkbox, EmptyState, Flash, PageHeader, TextField, buttonClass } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { certificateRecipients } from "@/lib/certificates";
import { createClient } from "@/lib/supabase/server";
import type { Hackathon } from "@/lib/types";
import type { CertificateSettings } from "@/lib/certificates";
import { saveCertificateSettings, setTeamAward } from "./actions";

export const metadata: Metadata = { title: "Certificates" };

/** Certificate details, awards for winning teams, previews and downloads. */
export default async function CertificatesPage(props: PageProps<"/staff/certificates">) {
  const session = await requirePermission("manage_event");
  const sp = await props.searchParams;
  const { data: h } = await (await createClient()).from("hackathons").select("*").eq("id", session.hackathonId).single<Hackathon & CertificateSettings>();
  const people = await certificateRecipients(session.hackathonId);
  const teams = [...new Map(people.map((p) => [p.teamId, { id: p.teamId, name: p.teamName, code: p.teamCode, award: p.award, members: people.filter((x) => x.teamId === p.teamId) }])).values()];
  const achievement = people.filter((p) => p.award).length;

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Everyone who checked in gets a certificate in your Brand Kit colours. Give a team an award and its members get a certificate of achievement instead."
        actions={<>
          <a href="/api/certificates/sample" className={buttonClass("secondary")} target="_blank" rel="noreferrer">Preview sample</a>
          {people.length > 0 && <a href="/api/certificates/zip" className={buttonClass("primary")}>Download all ({people.length}) as ZIP</a>}
        </>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6"><Alert tone="blue" title="You send the certificates">Teams can&apos;t download them: their logins close when the hackathon ends. Download a team&apos;s certificates here and send them (WhatsApp, email).</Alert></div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardTitle description={`${people.length} certificates: ${people.length - achievement} participation, ${achievement} achievement.`}>Teams and awards</CardTitle>
            {!teams.length ? (
              <EmptyState title="Nobody has checked in yet">Certificates are for participants whose ID card was scanned at attendance.</EmptyState>
            ) : (
              <ul className="divide-y-2 divide-line-soft">
                {teams.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{t.name} <span className="font-mono text-xs text-muted">{t.code}</span> {t.award && <Badge tone="violet">{t.award}</Badge>}</p>
                      <p className="text-sm text-ink-soft">{t.members.map((m) => m.fullName).join(", ")}</p>
                      <a href={`/api/certificates/team/${t.id}`} className="text-sm font-bold text-brand hover:underline">Download team certificates</a>
                    </div>
                    <form action={setTeamAward.bind(null, t.id)} className="flex items-end gap-2">
                      <TextField label="Award (optional)" name="award" id={`award-${t.id}`} maxLength={60} defaultValue={t.award ?? ""} placeholder="e.g. Winner" className="w-44" />
                      <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card>
          <CardTitle description="Printed at the bottom of every certificate.">Signatures</CardTitle>
          <form action={saveCertificateSettings} className="space-y-4" encType="multipart/form-data">
            {([1, 2] as const).map((n) => (
              <fieldset key={n} className="space-y-2 rounded-md border-2 border-line p-3">
                <legend className="px-1 text-sm font-bold">Signatory {n}</legend>
                <TextField label="Name" name={`sig${n}_name`} id={`sig${n}-name`} maxLength={80} defaultValue={(n === 1 ? h?.cert_signatory1_name : h?.cert_signatory2_name) ?? ""} placeholder={n === 1 ? "e.g. Dr. Anita Rao" : "e.g. Karthik S"} />
                <TextField label="Title" name={`sig${n}_title`} id={`sig${n}-title`} maxLength={80} defaultValue={(n === 1 ? h?.cert_signatory1_title : h?.cert_signatory2_title) ?? ""} placeholder={n === 1 ? "e.g. Principal" : "e.g. Event Convenor"} />
                <div>
                  <label htmlFor={`sig${n}-image`} className="block text-sm font-bold text-ink">Signature image (optional, PNG or JPG)</label>
                  <input id={`sig${n}-image`} name={`sig${n}_image`} type="file" accept="image/png,image/jpeg" className="mt-1 block text-sm" />
                </div>
                {(n === 1 ? h?.cert_signature1_path : h?.cert_signature2_path) && <Checkbox name={`remove_sig${n}`} label="Remove the uploaded signature" />}
              </fieldset>
            ))}
            <TextField label="Extra line (optional)" name="note" id="cert-note" maxLength={200} defaultValue={h?.cert_note ?? ""} placeholder="e.g. In association with IEEE Student Branch" />
            <SubmitButton>Save certificate details</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
