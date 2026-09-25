import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { PermissionCheckboxes } from "@/components/users/permission-checkboxes";
import { Badge, Card, CardTitle, EmptyState, Flash, PageHeader, SelectField, Table, Td, TextField, Th } from "@/components/ui";
import { isSuperAdmin, type Session } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { invitationState } from "@/lib/invitations";
import { permissionLabel } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import type { Invitation, OfficialAssignment, Profile } from "@/lib/types";
import { changeStaffRole, revokeStaffInvitation, setStaffStatus, updateAssignment, updateStaffPermissions } from "./actions";
import { InviteStaffForm, ResetLinkButton } from "./invite-form";

const STATUS_TONE = { active: "green", suspended: "amber", deactivated: "red" } as const;
const INVITE_TONE = { pending: "blue", accepted: "green", revoked: "neutral", expired: "amber" } as const;

/**
 * Shared page for managing Admins or Officials. Access is checked by the
 * caller; data is read with the service client after that check.
 */
export async function StaffDirectory({ session, role, searchParams }: {
  session: Session; role: "admin" | "official"; searchParams: Record<string, string | string[] | undefined>;
}) {
  const service = createServiceClient();
  const roles = role === "admin" ? ["admin", "super_admin"] : ["official"];
  const [{ data: people }, { data: grants }, { data: invitations }, { data: assignments }, hackathon] = await Promise.all([
    service.from("profiles").select("*").in("role", roles).order("role").order("full_name").returns<Profile[]>(),
    service.from("staff_permissions").select("profile_id, permission").returns<{ profile_id: string; permission: string }[]>(),
    service.from("invitations").select("*").eq("role", role).eq("purpose", "activate").order("created_at", { ascending: false }).limit(50).returns<Invitation[]>(),
    role === "official" ? service.from("official_assignments").select("*").returns<OfficialAssignment[]>() : Promise.resolve({ data: [] as OfficialAssignment[] }),
    getHackathon(),
  ]);
  const grantsBy = new Map<string, Set<string>>();
  for (const g of grants ?? []) grantsBy.set(g.profile_id, (grantsBy.get(g.profile_id) ?? new Set()).add(g.permission));
  const assignmentBy = new Map((assignments ?? []).map((a) => [a.profile_id, a]));
  const granter = { isSuperAdmin: isSuperAdmin(session), permissions: session.permissions };
  const label = role === "admin" ? "Admins" : "Officials";
  const eventName = hackathon?.name ?? "Hackathon";
  const defaults = new Set(role === "admin"
    ? ["manage_event", "manage_registrations", "edit_registrations", "view_participants", "generate_pdf", "record_attendance", "manual_checkin", "correct_attendance", "view_attendance", "publish_announcements", "manage_all_support", "view_reports"]
    : ["record_attendance"]);

  return (
    <>
      <PageHeader
        title={`User Management · ${label}`}
        description={role === "admin"
          ? "Only the Super Admin can invite Admins. Admins receive exactly the permissions you tick; they cannot create Admins or raise their own access."
          : "Officials handle check-in and assigned help-desk duties. Manual check-in, corrections and wider access require explicit permissions."}
      />
      <Flash notice={searchParams.notice} error={searchParams.error} />
      <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
        <div className="space-y-4">
          {!people?.length ? (
            <EmptyState title={`No ${label.toLowerCase()} yet`}>Create an invitation to add one.</EmptyState>
          ) : (
            people.map((p) => {
              const self = p.id === session.userId;
              const manageable = !self && p.role !== "super_admin";
              const assignment = assignmentBy.get(p.id);
              const held = grantsBy.get(p.id) ?? new Set<string>();
              return (
                <Card key={p.id}>
                  <CardTitle
                    description={<>{p.email}{p.job_title && ` · ${p.job_title}`}{p.phone && ` · ${p.phone}`} · last sign-in {formatDateTime(p.last_sign_in_at)}</>}
                    actions={<>
                      <Badge tone={p.role === "super_admin" ? "violet" : "blue"}>{ROLE_LABEL[p.role]}</Badge>
                      <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                      {self && <Badge>You</Badge>}
                    </>}
                  >
                    {p.full_name ?? p.email}
                  </CardTitle>
                  {p.role === "super_admin" ? (
                    <p className="text-sm text-slate-400">The Super Admin holds every permission and cannot be modified here.</p>
                  ) : !manageable ? (
                    <p className="text-sm text-slate-400">Permissions: {[...held].map(permissionLabel).join(", ") || "none"}</p>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-sm text-violet-300">
                        Manage · {held.size} permission{held.size === 1 ? "" : "s"}{assignment?.station ? ` · ${assignment.station}` : ""}
                      </summary>
                      <div className="mt-4 grid gap-6 lg:grid-cols-2">
                        <form action={updateStaffPermissions.bind(null, p.id)} className="space-y-3">
                          <p className="text-sm font-semibold text-slate-200">Permissions</p>
                          <PermissionCheckboxes role={p.role as "admin" | "official"} checked={held} granter={granter} />
                          <SubmitButton size="sm">Save permissions</SubmitButton>
                        </form>
                        <div className="space-y-4">
                          {p.role === "official" && (
                            <form action={updateAssignment.bind(null, p.id)} className="grid gap-3 sm:grid-cols-2">
                              <TextField label="Duty" name="duty" id={`duty-${p.id}`} defaultValue={assignment?.duty ?? ""} maxLength={150} />
                              <TextField label="Station" name="station" id={`station-${p.id}`} defaultValue={assignment?.station ?? ""} maxLength={100} />
                              <div className="sm:col-span-2"><SubmitButton variant="secondary" size="sm">Save duty</SubmitButton></div>
                            </form>
                          )}
                          <ResetLinkButton profileId={p.id} eventName={eventName} />
                          <div className="flex flex-wrap gap-2">
                            {p.status !== "active" && (
                              <form action={setStaffStatus.bind(null, p.id, "active")}><ConfirmSubmit variant="success" size="sm" message="Reactivate this account?">Reactivate</ConfirmSubmit></form>
                            )}
                            {p.status === "active" && (
                              <form action={setStaffStatus.bind(null, p.id, "suspended")}><ConfirmSubmit variant="secondary" size="sm" message="Suspend this account temporarily? They are signed out immediately.">Suspend</ConfirmSubmit></form>
                            )}
                            {p.status !== "deactivated" && (
                              <form action={setStaffStatus.bind(null, p.id, "deactivated")}><ConfirmSubmit variant="danger" size="sm" message="Deactivate this account? Access is revoked until reactivated.">Deactivate</ConfirmSubmit></form>
                            )}
                          </div>
                          {isSuperAdmin(session) && (
                            <form action={changeStaffRole.bind(null, p.id)} className="flex flex-wrap items-end gap-2">
                              <SelectField label="Role" name="role" id={`role-${p.id}`} defaultValue={p.role} className="min-w-40"
                                options={[{ value: "official", label: "Official" }, { value: "admin", label: "Admin" }]} />
                              <ConfirmSubmit variant="secondary" size="sm" message="Change this account's role? Permissions that don't fit the new role are removed.">Change role</ConfirmSubmit>
                            </form>
                          )}
                        </div>
                      </div>
                    </details>
                  )}
                </Card>
              );
            })
          )}

          <Card>
            <CardTitle description="Links are single-use and expire. Revoke a link if it was sent to the wrong person.">Invitations</CardTitle>
            {!invitations?.length ? (
              <EmptyState title="No invitations yet" />
            ) : (
              <Table caption={`${label} invitations`}>
                <thead><tr><Th>Invitee</Th><Th>Permissions</Th><Th>Status</Th><Th>Expires</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
                <tbody className="divide-y divide-navy-800">
                  {invitations.map((inv) => {
                    const st = invitationState(inv);
                    return (
                      <tr key={inv.id}>
                        <Td>{inv.full_name}<div className="text-xs text-slate-400">{inv.email}</div></Td>
                        <Td className="text-xs text-slate-300">{inv.permissions.map(permissionLabel).join(", ") || "—"}</Td>
                        <Td><Badge tone={INVITE_TONE[st]}>{st === "pending" ? "invited" : st}</Badge></Td>
                        <Td className="whitespace-nowrap">{formatDateTime(inv.expires_at)}</Td>
                        <Td>{st === "pending" && (
                          <form action={revokeStaffInvitation.bind(null, inv.id)}><ConfirmSubmit variant="ghost" size="sm" message="Revoke this invitation? The link stops working.">Revoke</ConfirmSubmit></form>
                        )}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div>
          <InviteStaffForm role={role} eventName={eventName} permissionFields={<PermissionCheckboxes role={role} checked={defaults} granter={granter} />} />
        </div>
      </div>
    </>
  );
}
