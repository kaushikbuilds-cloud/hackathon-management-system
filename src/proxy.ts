import { NextResponse, type NextRequest } from "next/server";
import { APP_USER_AGENT } from "@/lib/native-app";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // The Android app skips the public landing page.
  if (request.nextUrl.pathname === "/" && request.headers.get("user-agent")?.includes(APP_USER_AGENT)) {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
