import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ActivateForm } from "./activate-form";

export const metadata: Metadata = { title: "Activate your account", robots: { index: false } };

export default function ActivatePage() {
  return (
    <AuthShell
      title="Activate your account"
      description="Use the Participant ID and one-time activation code printed on your ID card, then choose your password."
      footer={<>Already activated? <Link href="/login" className="text-violet-300 hover:text-violet-200">Sign in</Link></>}
    >
      <ActivateForm />
    </AuthShell>
  );
}
