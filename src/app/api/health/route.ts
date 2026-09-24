import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness + configuration presence check. Reports only whether settings exist, never their values. */
export function GET() {
  const has = (...names: string[]) => names.some((n) => Boolean(process.env[n]?.trim()));
  const config = {
    supabaseUrl: has("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    publicKey: has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"),
    secretKey: has("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    appUrl: has("NEXT_PUBLIC_APP_URL"),
    vercelEnv: process.env.VERCEL_ENV ?? null,
  };
  const ok = config.supabaseUrl && config.publicKey && config.secretKey;
  return NextResponse.json({ ok, config, time: new Date().toISOString() }, { status: ok ? 200 : 503 });
}
