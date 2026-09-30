import { NextResponse, type NextRequest } from "next/server";
import { sameSiteUrl } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/** PKCE callback (password recovery links sent via resetPasswordForEmail from the server). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(sameSiteUrl(searchParams.get("next"), origin, "/change-password"));
  }
  return NextResponse.redirect(new URL("/login?error=link_invalid", origin));
}
