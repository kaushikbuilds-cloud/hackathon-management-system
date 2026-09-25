import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui";
import { getSession, homePathFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  no_team: "Your account is not linked to a team. Contact the organisers.",
  no_shop: "This shop login is not linked to a shop any more. Contact the organisers.",
  link_invalid: "That sign-in link is invalid or has expired. Request a new one.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const session = await getSession();
  if (session && !sp.error) redirect(homePathFor(session.profile.role));
  const next = typeof sp.next === "string" ? sp.next : "";
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  return (
    <AuthShell title="Sign in" description="Admins, officials and registered team members." footer={<div className="space-y-2"><p>Got an ID card? <Link href="/activate" className="text-brand hover:text-brand">Activate your account</Link></p><Link href="/" className="hover:text-ink">← Back to event page</Link></div>}>
      {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}
      <LoginForm next={next} />
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-brand hover:text-brand">Forgot your password?</Link>
      </p>
    </AuthShell>
  );
}
