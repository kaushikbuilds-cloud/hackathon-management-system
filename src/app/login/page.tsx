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
  link_invalid: "That sign-in link is invalid or has expired. Request a new one.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const session = await getSession();
  if (session && !sp.error) redirect(homePathFor(session.profile.role));
  const next = typeof sp.next === "string" ? sp.next : "";
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  return (
    <AuthShell title="Sign in" description="Admins, officials and registered team members." footer={<Link href="/" className="hover:text-white">← Back to event page</Link>}>
      {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}
      <LoginForm next={next} />
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-violet-300 hover:text-violet-200">Forgot your password?</Link>
      </p>
    </AuthShell>
  );
}
