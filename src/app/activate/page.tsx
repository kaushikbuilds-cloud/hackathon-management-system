import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ActivateForm } from "./activate-form";

export const metadata: Metadata = { title: "Activate your account", robots: { index: false } };

export default function ActivatePage() {
  return (
    <AuthShell
      title="Activate your team login"
      description="Use the Team ID and one-time activation code printed on your ID card, then choose a password to share with your team."
      footer={<>Already activated? <Link href="/login" className="text-brand hover:text-brand">Sign in</Link></>}
    >
      <ActivateForm />
    </AuthShell>
  );
}
