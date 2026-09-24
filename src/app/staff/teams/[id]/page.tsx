import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { AttendanceBadge, PdfBadge, RegistrationBadge } from "@/components/status";
import {
  Badge, Card, CardTitle, DescriptionList, EmptyState, Flash, LinkButton, PageHeader, SelectField, Table, Td, TextField, Th,
} from "@/components/ui";
import { can, isAdmin, requireStaff } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { resolveCustomQuestions } from "@/lib/domain/registration";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog, IdCardJob, ParticipantOverview, Profile, Team } from "@/lib/types";
import {
  addParticipant, makeLeader, removeParticipant, rotateQr, setQrRevoked, setTeamStatus, toggleAccount, updateParticipant, updateTeam, uploadPhoto,
} from "./actions";
import { CredentialActions } from "./credential-actions";

export const metadata: Metadata = { title: "Team details" };

export default async function TeamDetailPage(props: PageProps<"/staff/teams/[id]">) {
  const session = await requireStaff();
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: team } = await supabase.from("teams").select("*, registration_forms(custom_questions, max_team_size)").eq("id", id).maybeSingle<Team & { registration_forms: { custom_questions: unknown; max_team_size: number } | null }>();
  if (!team) notFound();

  const admin = isAdmin(session);
  const canEdit = can(session, "edit_registrations");
  const canPdf = can(session, "generate_pdf");
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";

  const [{ data: members }, { data: jobs }, { data: accounts }] = await Promise.all([
    supabase.from("participant_overview").select("*").eq("team_id", id).order("role").order("participant_code").returns<ParticipantOverview[]>(),
    supabase.from("id_card_jobs").select("*").eq("team_id", id).order("created_at", { ascending: false }).limit(10).returns<IdCardJob[]>(),
    admin
      ? supabase.from("profiles").select("id, participant_id, is_active, must_change_password, last_sign_in_at").eq("role", "participant").returns<Pick<Profile, "id" | "participant_id" | "is_active" | "must_change_password" | "last_sign_in_at">[]>()
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "participant_id" | "is_active" | "must_change_password" | "last_sign_in_at">[] }),
  ]);
  const memberIds = (members ?? []).map((m) => m.id);
  const accountByParticipant = new Map((accounts ?? []).filter((a) => a.participant_id && memberIds.includes(a.participant_id)).map((a) => [a.participant_id!, a]));
  const { data: history } = admin
    ? await supabase.from("audit_logs").select("*").in("entity_id", [id, ...memberIds]).order("created_at", { ascending: false }).limit(30).returns<AuditLog[]>()
    : { data: [] as AuditLog[] };

  const questions = resolveCustomQuestions(team.registration_forms?.custom_questions);
  const maxMembers = team.registration_forms?.max_team_size ?? 20;
  const list = members ?? [];

  return (
    <>
      <PageHeader
        back={{ href: "/staff/teams", label: "Teams" }}
        title={team.name}
        description={<span className="font-mono">{team.team_code}</span>}
        actions={canPdf && <LinkButton href={`/staff/teams/${id}/id-cards`}>ID Card PDF</LinkButton>}
      />
      <Flash notice={sp.notice} error={sp.error} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle>Team information</CardTitle>
          <DescriptionList
            items={[
              { label: "Team ID", value: <span className="font-mono">{team.team_code}</span> },
              { label: "Registration status", value: <span className="inline-flex items-center gap-2"><RegistrationBadge status={team.status} />{team.status_reason && <span className="text-slate-400">— {team.status_reason}</span>}</span> },
              { label: "College", value: team.college },
              { label: "ID card PDF", value: <PdfBadge status={team.pdf_status} /> },
              { label: "Registered", value: formatDateTime(team.created_at, tz) },
              { label: "Last updated", value: formatDateTime(team.updated_at, tz) },
              ...questions.map((q) => ({ label: q.label, value: team.custom_answers?.[q.id] || "—" })),
            ]}
          />
          {canEdit && (
            <details className="mt-6 rounded-xl border border-navy-700 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">Correct team details</summary>
              <form action={updateTeam.bind(null, id)} className="mt-4 grid gap-4 sm:grid-cols-2">
                <TextField label="Team name" name="name" defaultValue={team.name} required maxLength={80} hint="Must stay unique (case and spacing are ignored)." />
                <TextField label="College" name="college" defaultValue={team.college ?? ""} maxLength={150} />
                <div className="sm:col-span-2"><SubmitButton size="sm">Save changes</SubmitButton></div>
              </form>
            </details>
          )}
        </Card>

        {canEdit && (
          <Card>
            <CardTitle description="Approve, reject or flag this registration. Changes are audited.">Review</CardTitle>
            <form action={setTeamStatus.bind(null, id)} className="space-y-3">
              <SelectField label="Status" name="status" defaultValue={team.status}
                options={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "flagged", label: "Flagged" }, { value: "rejected", label: "Rejected" }]} />
              <TextField label="Reason / note" name="reason" defaultValue={team.status_reason ?? ""} maxLength={500} hint="Required for rejected or flagged." />
              <SubmitButton size="sm">Update status</SubmitButton>
            </form>
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardTitle description={`${list.length} of max ${maxMembers} members`}>Members</CardTitle>
        {list.length === 0 ? (
          <EmptyState title="No members" />
        ) : (
          <Table caption={`Members of ${team.name}`}>
            <thead>
              <tr>
                <Th>Participant ID</Th><Th>Name</Th><Th>Role</Th><Th>Email</Th><Th>Phone</Th><Th>Department</Th><Th>Year</Th><Th>Attendance</Th>{admin && <Th>Account</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800">
              {list.map((m) => {
                const acct = accountByParticipant.get(m.id);
                return (
                  <tr key={m.id}>
                    <Td className="font-mono text-xs whitespace-nowrap">{m.participant_code}{m.qr_revoked_at && <div><Badge tone="red">QR revoked</Badge></div>}</Td>
                    <Td className="font-medium">{m.full_name}</Td>
                    <Td>{m.role === "leader" ? <Badge tone="violet">Team Leader</Badge> : "Member"}</Td>
                    <Td className="break-all">{m.email}</Td>
                    <Td className="whitespace-nowrap">{m.phone ?? "—"}</Td>
                    <Td>{m.department ?? "—"}</Td>
                    <Td>{m.academic_year ?? "—"}</Td>
                    <Td><AttendanceBadge state={m.attendance_state} /></Td>
                    {admin && (
                      <Td className="whitespace-nowrap">
                        {!acct ? <Badge>No account</Badge> : !acct.is_active ? <Badge tone="red">Deactivated</Badge> : acct.must_change_password ? <Badge tone="amber">Temp password</Badge> : <Badge tone="green">Active</Badge>}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {(canEdit || admin) && list.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Manage members</h3>
            {list.map((m) => {
              const acct = accountByParticipant.get(m.id);
              return (
                <details key={m.id} className="rounded-xl border border-navy-700 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                    {m.full_name} <span className="font-mono text-xs text-slate-400">({m.participant_code})</span>
                  </summary>
                  <div className="mt-4 grid gap-6 lg:grid-cols-2">
                    {canEdit && (
                      <form action={updateParticipant.bind(null, id, m.id)} className="grid gap-3 sm:grid-cols-2">
                        <TextField label="Full name" name="full_name" id={`p-${m.id}-full_name`} defaultValue={m.full_name} required maxLength={100} />
                        <TextField label="Email" name="email" id={`p-${m.id}-email`} type="email" defaultValue={m.email} required maxLength={254} />
                        <TextField label="Phone" name="phone" id={`p-${m.id}-phone`} defaultValue={m.phone ?? ""} maxLength={20} />
                        <TextField label="College" name="college" id={`p-${m.id}-college`} defaultValue={m.college ?? ""} maxLength={150} />
                        <TextField label="Department" name="department" id={`p-${m.id}-department`} defaultValue={m.department ?? ""} maxLength={100} />
                        <TextField label="Academic year" name="academic_year" id={`p-${m.id}-academic_year`} defaultValue={m.academic_year ?? ""} maxLength={30} />
                        <div className="sm:col-span-2"><SubmitButton size="sm">Save participant</SubmitButton></div>
                      </form>
                    )}
                    <div className="space-y-4">
                      {canEdit && (
                        <div className="flex flex-wrap gap-2">
                          {m.role !== "leader" && (
                            <form action={makeLeader.bind(null, id, m.id)}><SubmitButton variant="secondary" size="sm">Make team leader</SubmitButton></form>
                          )}
                          <form action={setQrRevoked.bind(null, id, m.id, !m.qr_revoked_at)}>
                            <ConfirmSubmit variant={m.qr_revoked_at ? "success" : "danger"} size="sm" message={m.qr_revoked_at ? "Restore this QR code?" : "Revoke this participant's QR code? Scans will be rejected."}>
                              {m.qr_revoked_at ? "Restore QR" : "Revoke QR"}
                            </ConfirmSubmit>
                          </form>
                          <form action={rotateQr.bind(null, id, m.id)}>
                            <ConfirmSubmit variant="secondary" size="sm" message="Issue a new QR code? The printed card stops working until it is reprinted.">Issue new QR</ConfirmSubmit>
                          </form>
                          {admin && m.role !== "leader" && (
                            <form action={removeParticipant.bind(null, id, m.id)}>
                              <ConfirmSubmit variant="danger" size="sm" message={`Remove ${m.full_name} from the team? This cannot be undone.`}>Remove member</ConfirmSubmit>
                            </form>
                          )}
                        </div>
                      )}
                      {canEdit && (
                        <form action={uploadPhoto.bind(null, id, m.id)} className="flex flex-wrap items-end gap-2">
                          <div>
                            <label htmlFor={`photo-${m.id}`} className="block text-sm font-medium text-slate-200">ID card photo (PNG/JPG, max 2 MB)</label>
                            <input id={`photo-${m.id}`} name="photo" type="file" accept="image/png,image/jpeg" required className="mt-1 block text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-navy-700 file:px-3 file:py-1.5 file:text-slate-100" />
                          </div>
                          <SubmitButton variant="secondary" size="sm">Upload</SubmitButton>
                        </form>
                      )}
                      {admin && (
                        <div className="space-y-2 border-t border-navy-800 pt-4">
                          <p className="text-sm font-semibold text-slate-200">Portal account</p>
                          <CredentialActions participantId={m.id} hasAccount={Boolean(acct)} />
                          {acct && (
                            <form action={toggleAccount.bind(null, id, acct.id, !acct.is_active)}>
                              <ConfirmSubmit variant={acct.is_active ? "danger" : "success"} size="sm" message={acct.is_active ? "Deactivate this account?" : "Reactivate this account?"}>
                                {acct.is_active ? "Deactivate account" : "Reactivate account"}
                              </ConfirmSubmit>
                            </form>
                          )}
                          {acct?.last_sign_in_at && <p className="text-xs text-slate-400">Last sign-in {formatDateTime(acct.last_sign_in_at, tz)}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {canEdit && list.length < maxMembers && (
          <details className="mt-4 rounded-xl border border-dashed border-navy-600 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">+ Add a member</summary>
            <form action={addParticipant.bind(null, id)} className="mt-4 grid gap-3 sm:grid-cols-3">
              <TextField label="Full name" name="full_name" required maxLength={100} />
              <TextField label="Email" name="email" type="email" required maxLength={254} />
              <TextField label="Phone" name="phone" maxLength={20} />
              <TextField label="College" name="college" maxLength={150} placeholder={team.college ?? ""} />
              <TextField label="Department" name="department" maxLength={100} />
              <TextField label="Academic year" name="academic_year" maxLength={30} />
              <div className="sm:col-span-3"><SubmitButton size="sm">Add member</SubmitButton></div>
            </form>
          </details>
        )}
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>ID card PDF history</CardTitle>
          {!jobs?.length ? (
            <EmptyState title="No PDFs generated yet" />
          ) : (
            <ul className="divide-y divide-navy-800 text-sm">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatDateTime(j.created_at, tz)} · v{j.template_version ?? "?"} · {j.page_count || j.member_count} pages
                    {j.error && <span className="block text-xs text-red-300">{j.error}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={j.status === "completed" ? "green" : j.status === "failed" ? "red" : "amber"}>{j.status}</Badge>
                    {j.status === "completed" && canPdf && <a className="text-blue-300 hover:underline" href={`/api/id-cards/jobs/${j.id}/download`}>Download</a>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {admin && (
          <Card>
            <CardTitle description="Registration edits, status changes and member changes.">Change history</CardTitle>
            {!history?.length ? (
              <EmptyState title="No changes recorded" />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
                {history.map((h) => (
                  <li key={h.id} className="rounded-lg bg-navy-850 px-3 py-2">
                    <p className="font-medium text-slate-100">{h.action} <span className="text-xs text-slate-400">· {h.actor_role ?? "system"} · {formatDateTime(h.created_at, tz)}</span></p>
                    <p className="mt-0.5 break-all font-mono text-xs text-slate-400">{summarizeDetails(h.details)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function summarizeDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .slice(0, 6)
    .map(([k, v]) => {
      if (v && typeof v === "object" && "from" in v && "to" in v) {
        const c = v as { from: unknown; to: unknown };
        return `${k}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join("; ")
    .slice(0, 400);
}
