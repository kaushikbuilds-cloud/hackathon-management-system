import type { Metadata } from "next";
import { Card, CardTitle, DescriptionList, LinkButton, PageHeader } from "@/components/ui";
import { can, requireStaff } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { settings } from "@/lib/env";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireStaff();
  const perms = session.profile.role === "official"
    ? (["edit_registrations", "generate_pdf", "correct_attendance", "manage_all_support"] as const).filter((p) => can(session, p)).join(", ") || "View, check-in and assigned support only"
    : "All permissions";
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle actions={<LinkButton href="/change-password" variant="secondary" size="sm">Change password</LinkButton>}>Your account</CardTitle>
          <DescriptionList items={[
            { label: "Name", value: session.profile.full_name },
            { label: "Email", value: session.email },
            { label: "Role", value: ROLE_LABEL[session.profile.role] },
            { label: "Permissions", value: perms },
            { label: "Last sign-in", value: formatDateTime(session.profile.last_sign_in_at) },
          ]} />
        </Card>
        <Card>
          <CardTitle description="Configured through environment variables (see README).">Security configuration</CardTitle>
          <DescriptionList items={[
            { label: "Temporary password lifetime", value: `${settings.tempPasswordTtlHours} hours` },
            { label: "Signed download URL lifetime", value: `${settings.signedUrlSeconds} seconds` },
            { label: "Auto-invite on registration", value: settings.autoInviteOnRegistration ? "Enabled" : "Disabled" },
            { label: "Rate limits", value: "Registration 10/h per IP · Sign-in 10/15 min per IP+email · Reset 5/h" },
          ]} />
        </Card>
      </div>
    </>
  );
}
