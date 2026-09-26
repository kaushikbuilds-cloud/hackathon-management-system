import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { AttendanceBadge, PaymentBadge, PdfBadge, RegistrationBadge } from "@/components/status";
import { formatRupees } from "@/lib/domain/fees";
import {
  Alert, Badge, buttonClass, Card, CardTitle, DescriptionList, EmptyState, Flash, LinkButton, PageHeader, SelectField, Table, Td, TextField, Th,
} from "@/components/ui";
import { can, isSuperAdmin, requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { resolveCustomQuestions } from "@/lib/domain/registration";
import { formatDateTime } from "@/lib/format";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AuditLog, IdCardJob, ParticipantOverview, Profile, Team } from "@/lib/types";
import {
  addParticipant, issueNewTeamCode, makeLeader, removeParticipant, reviewPayment, rotateQr, setParticipantAccountStatus, setQrRevoked, setTeamStatus, updateParticipant, updateTeam, uploadPhoto,
} from "./actions";

export const metadata: Metadata = { title: "Team details" };

export default async function TeamDetailPage(props: PageProps<"/staff/teams/[id]">) {
  const session = await requirePermission("view_participants", "edit_registrations", "manage_registrations");
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: team } = await supabase.from("teams").select("*, registration_forms(custom_questions, max_team_size)").eq("id", id).maybeSingle<Team & { registration_forms: { custom_questions: unknown; max_team_size: number } | null }>();
  if (!team) notFound();

  const canEdit = can(session, "edit_registrations");
  // Approving registrations and managing participant portal access.
  const canAccounts = can(session, "manage_registrations");
  const canHistory = canEdit || isSuperAdmin(session);
  const canPdf = can(session, "generate_pdf");
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";

  const [{ data: members }, { data: jobs }, { data: accounts }] = await Promise.all([
    supabase.from("participant_overview").select("*").eq("team_id", id).order("role").order("participant_code").returns<ParticipantOverview[]>(),
    supabase.from("id_card_jobs").select("*").eq("team_id", id).order("created_at", { ascending: false }).limit(10).returns<IdCardJob[]>(),
    canAccounts
      ? createServiceClient().from("profiles").select("id, participant_id, status, last_sign_in_at").eq("role", "participant").eq("hackathon_id", session.hackathonId ?? "").returns<Pick<Profile, "id" | "participant_id" | "status" | "last_sign_in_at">[]>()
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "participant_id" | "status" | "last_sign_in_at">[] }),
  ]);
  const [{ data: teamAccount }, { data: teamCode }] = canAccounts
    ? await Promise.all([
        createServiceClient().from("profiles").select("id, status, last_sign_in_at").eq("team_id", id).maybeSingle<Pick<Profile, "id" | "status" | "last_sign_in_at">>(),
        createServiceClient().from("team_activation_codes").select("used_at").eq("team_id", id).maybeSingle<{ used_at: string | null }>(),
      ])
    : [{ data: null }, { data: null }];
  const memberIds = (members ?? []).map((m) => m.id);
  const accountByParticipant = new Map((accounts ?? []).filter((a) => a.participant_id && memberIds.includes(a.participant_id)).map((a) => [a.participant_id!, a]));
  const { data: history } = canHistory
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
              { label: "Registration status", value: <span className="inline-flex items-center gap-2"><RegistrationBadge status={team.status} />{team.status_reason && <span className="text-muted">— {team.status_reason}</span>}</span> },
              { label: "College", value: team.college },
              { label: "ID card PDF", value: <PdfBadge status={team.pdf_status} /> },
              { label: "Registered", value: formatDateTime(team.created_at, tz) },
              { label: "Last updated", value: formatDateTime(team.updated_at, tz) },
              ...questions.map((q) => ({ label: q.label, value: team.custom_answers?.[q.id] || "—" })),
            ]}
          />
          {canEdit && (
            <details className="mt-6 rounded-md border-2 border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">Correct team details</summary>
              <form action={updateTeam.bind(null, id)} className="mt-4 grid gap-4 sm:grid-cols-2">
                <TextField label="Team name" name="name" defaultValue={team.name} required maxLength={80} hint="Must stay unique (case and spacing are ignored)." />
                <TextField label="College" name="college" defaultValue={team.college ?? ""} maxLength={150} />
                <div className="sm:col-span-2"><SubmitButton size="sm">Save changes</SubmitButton></div>
              </form>
            </details>
          )}
        </Card>

        {(team.payment_status ?? "not_required") !== "not_required" && (
          <Card className={canAccounts ? "xl:col-start-3" : undefined}>
            <CardTitle description="Check the screenshot and that the UTR appears in your UPI app's history before verifying.">Registration fee</CardTitle>
            <DescriptionList items={[
              { label: "Status", value: <PaymentBadge status={team.payment_status} /> },
              { label: "Amount", value: team.payment_amount != null ? formatRupees(Number(team.payment_amount)) : "—" },
              { label: "UTR / transaction ID", value: <span className="font-mono">{team.payment_utr ?? "—"}</span> },
              { label: "Submitted", value: formatDateTime(team.payment_submitted_at, tz) },
              ...(team.payment_note ? [{ label: "Note", value: team.payment_note }] : []),
              ...(team.payment_verified_at ? [{ label: "Reviewed", value: formatDateTime(team.payment_verified_at, tz) }] : []),
            ]} />
            {team.payment_proof_path && canAccounts && (
              <a href={`/api/teams/${id}/payment-proof`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm", "mt-4")}>View payment screenshot</a>
            )}
            {canAccounts && (
              <form action={reviewPayment.bind(null, id)} className="mt-4 space-y-3 border-t-2 border-line-soft pt-4">
                <TextField label="Note to the team" name="note" maxLength={500} hint="Required when rejecting, e.g. 'Amount received was ₹200, expected ₹400'." />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton size="sm" variant="success" name="decision" value="verified">Mark as paid</SubmitButton>
                  <SubmitButton size="sm" variant="danger" name="decision" value="rejected">Reject payment</SubmitButton>
                </div>
              </form>
            )}
          </Card>
        )}

        {canAccounts && (
          <Card>
            <CardTitle
              description="The whole team signs in with its Team ID and one shared password. The one-time code to set it is printed on every member's ID card."
              actions={<Badge tone={teamAccount ? (teamAccount.status === "active" ? "green" : "red") : "neutral"}>{teamAccount ? (teamAccount.status === "active" ? "Active" : teamAccount.status) : "Not activated yet"}</Badge>}
            >
              Team login
            </CardTitle>
            <div className="space-y-3 text-sm">
              {teamAccount?.last_sign_in_at && <p className="text-muted">Last sign-in {formatDateTime(teamAccount.last_sign_in_at, tz)}</p>}
              {teamCode && !teamCode.used_at && teamAccount && <Alert tone="amber">A new code is waiting. Reprint the team&apos;s ID cards so they can set a new password.</Alert>}
              <form action={issueNewTeamCode.bind(null, id)}>
                <ConfirmSubmit variant="secondary" size="sm" message="Create a new team login code? The old code stops working, and the team sets a new password with the new one.">
                  {teamAccount ? "Forgot password: new code" : "New code"}
                </ConfirmSubmit>
              </form>
              {teamAccount && (
                <div className="flex flex-wrap gap-2">
                  {teamAccount.status === "active"
                    ? <form action={setParticipantAccountStatus.bind(null, id, teamAccount.id, "suspended")}><ConfirmSubmit variant="secondary" size="sm" message="Suspend the team login? Everyone using it is signed out.">Suspend login</ConfirmSubmit></form>
                    : <form action={setParticipantAccountStatus.bind(null, id, teamAccount.id, "active")}><ConfirmSubmit variant="success" size="sm" message="Reactivate the team login?">Reactivate login</ConfirmSubmit></form>}
                </div>
              )}
            </div>
          </Card>
        )}

        {canAccounts && (
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
                <Th>Participant ID</Th><Th>Name</Th><Th>Role</Th><Th>Email</Th><Th>Phone</Th><Th>Department</Th><Th>Year</Th><Th>Attendance</Th>{canAccounts && <Th>Account</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
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
                    {canAccounts && (
                      <Td className="whitespace-nowrap">
                        {!acct ? <Badge>No account</Badge> : acct.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone={acct.status === "suspended" ? "amber" : "red"}>{acct.status}</Badge>}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {(canEdit || canAccounts) && list.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-ink">Manage members</h3>
            {list.map((m) => {
              const acct = accountByParticipant.get(m.id);
              return (
                <details key={m.id} className="rounded-md border-2 border-line p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    {m.full_name} <span className="font-mono text-xs text-muted">({m.participant_code})</span>
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
                          {canAccounts && m.role !== "leader" && (
                            <form action={removeParticipant.bind(null, id, m.id)}>
                              <ConfirmSubmit variant="danger" size="sm" message={`Remove ${m.full_name} from the team? This cannot be undone.`}>Remove member</ConfirmSubmit>
                            </form>
                          )}
                        </div>
                      )}
                      {canEdit && (
                        <form action={uploadPhoto.bind(null, id, m.id)} className="flex flex-wrap items-end gap-2">
                          <div>
                            <label htmlFor={`photo-${m.id}`} className="block text-sm font-medium text-ink">ID card photo (PNG/JPG, max 2 MB)</label>
                            <input id={`photo-${m.id}`} name="photo" type="file" accept="image/png,image/jpeg" required className="mt-1 block text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-paper-2 file:px-3 file:py-1.5 file:text-ink" />
                          </div>
                          <SubmitButton variant="secondary" size="sm">Upload</SubmitButton>
                        </form>
                      )}
                      {canAccounts && acct && (
                        <div className="space-y-2 border-t border-line pt-4">
                          <p className="text-sm font-semibold text-ink">Personal portal account (older sign-in)</p>
                          <div className="flex flex-wrap gap-2">
                            {acct.status !== "active" && (
                              <form action={setParticipantAccountStatus.bind(null, id, acct.id, "active")}><ConfirmSubmit variant="success" size="sm" message="Reactivate this account?">Reactivate</ConfirmSubmit></form>
                            )}
                            {acct.status === "active" && (
                              <form action={setParticipantAccountStatus.bind(null, id, acct.id, "suspended")}><ConfirmSubmit variant="secondary" size="sm" message="Suspend this account? They are signed out immediately.">Suspend</ConfirmSubmit></form>
                            )}
                            {acct.status !== "deactivated" && (
                              <form action={setParticipantAccountStatus.bind(null, id, acct.id, "deactivated")}><ConfirmSubmit variant="danger" size="sm" message="Deactivate this account?">Deactivate</ConfirmSubmit></form>
                            )}
                          </div>
                          {acct.last_sign_in_at && <p className="text-xs text-muted">Last sign-in {formatDateTime(acct.last_sign_in_at, tz)}</p>}
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
          <details className="mt-4 rounded-md border-2 border-dashed border-line p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">+ Add a member</summary>
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
            <ul className="divide-y divide-line-soft text-sm">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatDateTime(j.created_at, tz)} · v{j.template_version ?? "?"} · {j.page_count || j.member_count} pages
                    {j.error && <span className="block text-xs text-danger">{j.error}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={j.status === "completed" ? "green" : j.status === "failed" ? "red" : "amber"}>{j.status}</Badge>
                    {j.status === "completed" && canPdf && <a className="text-grass hover:underline" href={`/api/id-cards/jobs/${j.id}/download`}>Download</a>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canHistory && (
          <Card>
            <CardTitle description="Registration edits, status changes and member changes.">Change history</CardTitle>
            {!history?.length ? (
              <EmptyState title="No changes recorded" />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
                {history.map((h) => (
                  <li key={h.id} className="rounded-lg bg-paper px-3 py-2">
                    <p className="font-medium text-ink">{h.action} <span className="text-xs text-muted">· {h.actor_role ?? "system"} · {formatDateTime(h.created_at, tz)}</span></p>
                    <p className="mt-0.5 break-all font-mono text-xs text-muted">{summarizeDetails(h.details)}</p>
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
