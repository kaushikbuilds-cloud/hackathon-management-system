import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/domain/password";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { findInvitation, invitationState } from "@/lib/invitations";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATE_TEXT = {
  accepted: "This link has already been used. Sign in with the password you chose.",
  revoked: "This link was cancelled by the organisers. Ask them for a new one.",
  expired: "This link has expired. Ask the organisers for a new one.",
} as const;

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const invitation = await findInvitation(token);
  const state = invitation ? invitationState(invitation) : null;
  const reset = invitation?.purpose === "reset";
  const roleLabel = invitation ? (invitation.role === "participant" ? "Team Portal" : ROLE_LABEL[invitation.role]) : "";

  return (
    <AuthShell
      title={reset ? "Set a new password" : "Activate your account"}
      description={invitation && state === "pending" ? (reset ? `For ${invitation.email}` : `You have been invited as ${invitation.role === "admin" ? "an" : "a"} ${roleLabel} user.`) : undefined}
      footer={<Link href="/login" className="hover:text-white">Go to sign in</Link>}
    >
      {!invitation ? (
        <Alert tone="red" title="Invalid link">This invitation link is not valid. Check that you copied the whole link.</Alert>
      ) : state !== "pending" ? (
        <Alert tone="amber" title="Link not usable">{STATE_TEXT[state as keyof typeof STATE_TEXT]}</Alert>
      ) : (
        <>
          <dl className="mb-5 space-y-1 rounded-xl bg-navy-850 p-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Email</dt><dd className="break-all text-slate-100">{invitation.email}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Access</dt><dd className="text-slate-100">{roleLabel}</dd></div>
            {invitation.station && <div className="flex justify-between gap-3"><dt className="text-slate-400">Station</dt><dd className="text-slate-100">{invitation.station}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Link expires</dt><dd className="text-slate-100">{formatDateTime(invitation.expires_at)}</dd></div>
          </dl>
          <p className="mb-4 text-sm text-slate-400">
            Choose a password (at least {PASSWORD_MIN_LENGTH} characters, using three of: lowercase, uppercase, digits, symbols). This link works once.
          </p>
          <AcceptForm token={token} defaultName={invitation.full_name ?? ""} reset={reset} />
        </>
      )}
    </AuthShell>
  );
}
