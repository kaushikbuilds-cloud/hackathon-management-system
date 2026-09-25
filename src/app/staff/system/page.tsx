import type { Metadata } from "next";
import { Card, CardTitle, DescriptionList, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { appUrl, settings } from "@/lib/env";

export const metadata: Metadata = { title: "System Settings" };

export default async function SystemSettingsPage() {
  await requireSuperAdmin();
  return (
    <>
      <PageHeader title="System Settings" description="Server configuration (set through environment variables in Vercel; see README)." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Access & invitations</CardTitle>
          <DescriptionList items={[
            { label: "Public URL (in QR codes & links)", value: appUrl() },
            { label: "Staff invitation lifetime", value: `${settings.staffInviteTtlHours} hours` },
            { label: "Participant activation lifetime", value: `${settings.participantInviteTtlHours} hours` },
            { label: "Private download link lifetime", value: `${settings.signedUrlSeconds} seconds` },
            { label: "One-time setup (/setup)", value: settings.setupToken ? "SETUP_TOKEN is set — remove it once setup is complete" : "Locked (no SETUP_TOKEN)" },
          ]} />
        </Card>
        <Card>
          <CardTitle>Security model</CardTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>No public sign-up: staff join by single-use, expiring invitation; participants activate after registering.</li>
            <li>Only the Super Admin invites Admins; Admins cannot create Admins or raise their own access.</li>
            <li>Permissions are enforced on the server and by database row-level security.</li>
            <li>Suspended or deactivated accounts lose access immediately and their sessions are revoked.</li>
            <li>Rate limits: registration 10/h per IP · sign-in 10/15 min per IP+email · resets 5/h.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
