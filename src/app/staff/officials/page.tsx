import type { Metadata } from "next";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, EmptyState, Flash, PageHeader, SelectField } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { OfficialPermissions, Profile } from "@/lib/types";
import { changeRole, toggleStaffActive, updatePermissions } from "./actions";
import { CreateStaffForm, PermissionChecks, ResetStaffPassword } from "./client";

export const metadata: Metadata = { title: "Officials & Permissions" };

export default async function OfficialsPage(props: PageProps<"/staff/officials">) {
  const session = await requireAdmin();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [{ data: staff }, { data: perms }] = await Promise.all([
    supabase.from("profiles").select("*").in("role", ["official", "admin", "super_admin"]).order("role").order("full_name").returns<Profile[]>(),
    supabase.from("official_permissions").select("*").returns<OfficialPermissions[]>(),
  ]);
  const permMap = new Map((perms ?? []).map((p) => [p.profile_id, p]));
  const superAdmin = session.profile.role === "super_admin";

  return (
    <>
      <PageHeader title="Officials & Permissions" description="Individual staff accounts. Officials only get the permissions you grant; admins have full access." />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {!staff?.length ? (
            <EmptyState title="No staff accounts" />
          ) : (
            staff.map((s) => {
              const self = s.id === session.userId;
              const manageable = !self && (s.role === "official" || superAdmin);
              const p = permMap.get(s.id);
              return (
                <Card key={s.id}>
                  <CardTitle
                    description={<>{s.email} · last sign-in {formatDateTime(s.last_sign_in_at)}</>}
                    actions={
                      <>
                        <Badge tone={s.role === "official" ? "blue" : "violet"}>{ROLE_LABEL[s.role]}</Badge>
                        {!s.is_active && <Badge tone="red">Deactivated</Badge>}
                        {s.must_change_password && <Badge tone="amber">Temp password</Badge>}
                        {self && <Badge>You</Badge>}
                      </>
                    }
                  >
                    {s.full_name ?? s.email}
                  </CardTitle>
                  {manageable && (
                    <div className="grid gap-6 lg:grid-cols-2">
                      {s.role === "official" ? (
                        <form action={updatePermissions.bind(null, s.id)} className="space-y-2">
                          <PermissionChecks values={p} />
                          <SubmitButton size="sm">Save permissions</SubmitButton>
                        </form>
                      ) : (
                        <p className="text-sm text-slate-400">Administrators have every permission.</p>
                      )}
                      <div className="space-y-3">
                        <ResetStaffPassword profileId={s.id} />
                        <form action={toggleStaffActive.bind(null, s.id, !s.is_active)}>
                          <ConfirmSubmit variant={s.is_active ? "danger" : "success"} size="sm" message={s.is_active ? "Deactivate this account? They will be signed out." : "Reactivate this account?"}>
                            {s.is_active ? "Deactivate" : "Reactivate"}
                          </ConfirmSubmit>
                        </form>
                        {superAdmin && (
                          <form action={changeRole.bind(null, s.id)} className="flex flex-wrap items-end gap-2">
                            <SelectField label="Role" name="role" id={`role-${s.id}`} defaultValue={s.role} className="min-w-40"
                              options={[{ value: "official", label: "Official" }, { value: "admin", label: "Admin" }, { value: "super_admin", label: "Super Admin" }]} />
                            <ConfirmSubmit variant="secondary" size="sm" message="Change this account's role?">Change role</ConfirmSubmit>
                          </form>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
        <CreateStaffForm canCreateAdmin={superAdmin} />
      </div>
    </>
  );
}
