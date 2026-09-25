import "server-only";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  }
  return value;
}

/**
 * Supabase URL and public key. Accepts both the new key names
 * (publishable / secret, "sb_publishable_…" / "sb_secret_…") and the legacy
 * anon / service_role JWT names.
 */
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
}

export function supabasePublicKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY
  );
}

/** Public config (the publishable/anon key is safe to expose; RLS protects data). */
export function publicEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)", supabaseUrl()),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)", supabasePublicKey()),
  };
}

/** Server-only secrets. Never import from client components. */
export function serverEnv() {
  return {
    serviceRoleKey: required(
      "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)",
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}

export function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

export const settings = {
  /** Hours a staff (Admin/Official) invitation or reset link stays valid. */
  staffInviteTtlHours: Number(process.env.STAFF_INVITE_TTL_HOURS || 72),
  /** Hours a participant activation link stays valid. */
  participantInviteTtlHours: Number(process.env.PARTICIPANT_INVITE_TTL_HOURS || 168),
  /** Signed URL lifetime for private files (PDFs, attachments). */
  signedUrlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS || 300),
  /** One-time token that allows creating the first Super Admin at /setup. */
  setupToken: process.env.SETUP_TOKEN || "",
};
