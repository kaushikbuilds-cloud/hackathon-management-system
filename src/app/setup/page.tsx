import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui";
import { settings } from "@/lib/env";
import { superAdminExists } from "./actions";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Initial setup", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const done = await superAdminExists();
  return (
    <AuthShell title="Initial setup" description="Create the Super Admin account. This works only once." footer={<Link href="/login" className="hover:text-ink">Go to sign in</Link>}>
      {done ? (
        <Alert tone="green" title="Setup complete">A Super Admin already exists. Sign in instead.</Alert>
      ) : settings.setupToken.length < 16 ? (
        <Alert tone="amber" title="Setup is locked">
          Set a <code>SETUP_TOKEN</code> environment variable (at least 16 random characters) on the server, redeploy, then return here.
          Remove it again after setup.
        </Alert>
      ) : (
        <SetupForm />
      )}
    </AuthShell>
  );
}
