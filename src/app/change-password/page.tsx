import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/domain/password";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ChangePasswordPage() {
  const session = await requireSession({ allowPasswordChange: true });
  return (
    <AuthShell title="Set a new password" description={`Signed in as ${session.email ?? "your account"}.`}>
      {session.profile.must_change_password && (
        <div className="mb-4">
          <Alert tone="amber">You are using a temporary password. Choose a new password to continue.</Alert>
        </div>
      )}
      <p className="mb-4 text-sm text-muted">
        At least {PASSWORD_MIN_LENGTH} characters, using three of: lowercase, uppercase, digits, symbols.
      </p>
      <ChangePasswordForm />
    </AuthShell>
  );
}
