import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { sameSiteUrl } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["invite", "recovery", "email", "magiclink", "signup", "email_change"];

/**
 * Token-hash confirmation for invite / recovery emails (see the email
 * templates in supabase/templates and README.md).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(sameSiteUrl(searchParams.get("next"), origin, "/change-password"));
  }
  return NextResponse.redirect(new URL("/login?error=link_invalid", origin));
}
