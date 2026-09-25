import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await getSession();
  const supabase = await createClient();
  await supabase.auth.signOut();
  if (session) await audit(session, "auth.sign_out", { type: "profiles", id: session.userId });
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}

/** Only for shop logins whose hackathon has ended (requireVendor sends them here). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session?.profile.role === "vendor" && request.nextUrl.searchParams.get("reason") === "shop_ended") {
    await (await createClient()).auth.signOut();
    await audit(session, "auth.sign_out", { type: "profiles", id: session.userId }, { reason: "shop_login_ended" });
  }
  return NextResponse.redirect(new URL("/login?error=shop_ended", request.nextUrl.origin), { status: 303 });
}
