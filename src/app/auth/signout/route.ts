import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getSession, hasClosedLogin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await getSession();
  const supabase = await createClient();
  await supabase.auth.signOut();
  if (session) await audit(session, "auth.sign_out", { type: "profiles", id: session.userId });
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}

/** Only for team and shop logins whose hackathon has ended (requireSession sends them here). */
export async function GET(request: NextRequest) {
  if (await hasClosedLogin()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.auth.signOut();
    await audit(null, "auth.sign_out", { type: "profiles", id: user?.id }, { reason: "hackathon_ended" });
  }
  return NextResponse.redirect(new URL("/login?error=ended", request.nextUrl.origin), { status: 303 });
}
