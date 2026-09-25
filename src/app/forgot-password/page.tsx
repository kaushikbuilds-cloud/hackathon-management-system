import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" description="We'll email you a secure link to choose a new password." footer={<Link href="/login" className="hover:text-ink">← Back to sign in</Link>}>
      <ForgotForm />
    </AuthShell>
  );
}
