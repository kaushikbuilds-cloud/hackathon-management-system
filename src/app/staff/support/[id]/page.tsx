import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/client";
import { SupportThread } from "@/components/support-thread";
import { Card, CardTitle, Flash, PageHeader, SelectField } from "@/components/ui";
import { can, requireHackathon, requireStaff } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { nextStatuses, supportStatusLabel } from "@/lib/domain/support";
import { assignRequest, updateRequestStatus } from "@/lib/support/actions";
import { loadSupportThread } from "@/lib/support/load";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Support request" };

export default async function StaffSupportDetail(props: PageProps<"/staff/support/[id]">) {
  const session = requireHackathon(await requireStaff());
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const thread = await loadSupportThread(supabase, id);
  if (!thread) notFound();
  const hackathon = await getHackathon();
  const { data: staff } = await supabase.from("profiles").select("id, full_name, email, role, is_active").in("role", ["official", "admin", "super_admin"]).eq("is_active", true).order("full_name").returns<Profile[]>();
  const { data: authors } = thread.authorIds.length
    ? await supabase.from("profiles").select("id, full_name, role").in("id", thread.authorIds).returns<{ id: string; full_name: string | null; role: string }[]>()
    : { data: [] };
  const { request } = thread;
  const canAssign = can(session, "manage_all_support");
  const options = nextStatuses(request.status);

  return (
    <>
      <PageHeader back={{ href: "/staff/support", label: "Help & Support" }} title="Support request" />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Status</CardTitle>
          {options.length === 0 ? (
            <p className="text-sm text-slate-400">This request is closed.</p>
          ) : (
            <form action={updateRequestStatus.bind(null, id)} className="flex flex-wrap items-end gap-3">
              <SelectField label="Move to" name="status" className="min-w-48" options={options.map((s) => ({ value: s, label: supportStatusLabel(s) }))} />
              <SubmitButton size="sm">Update</SubmitButton>
            </form>
          )}
        </Card>
        {canAssign && (
          <Card>
            <CardTitle>Assignment</CardTitle>
            <form action={assignRequest.bind(null, id)} className="flex flex-wrap items-end gap-3">
              <SelectField label="Assign to" name="assigned_to" className="min-w-56" defaultValue={request.assigned_to ?? ""}
                options={[{ value: "", label: "Unassigned" }, ...(staff ?? []).map((s) => ({ value: s.id, label: `${s.full_name ?? s.email} (${s.role})` }))]} />
              <SubmitButton size="sm">Save</SubmitButton>
            </form>
          </Card>
        )}
      </div>
      <SupportThread
        request={request}
        messages={thread.messages}
        authors={authors ?? []}
        history={thread.history}
        teamLabel={`${request.teams?.name ?? ""} (${request.teams?.team_code ?? ""})`}
        timeZone={hackathon?.timezone ?? "UTC"}
        staffView
      />
    </>
  );
}
