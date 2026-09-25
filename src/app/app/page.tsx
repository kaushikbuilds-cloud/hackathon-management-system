import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Start page of the Android app: straight to sign-in, or to the person's home once signed in. */
export default async function AppStartPage() {
  const session = await getSession();
  redirect(session ? homePathFor(session.profile.role) : "/login");
}
