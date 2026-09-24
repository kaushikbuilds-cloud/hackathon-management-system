import "server-only";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  }
  return value;
}

/** Public config (also exposed to the browser via NEXT_PUBLIC_*). */
export function publicEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

/** Server-only secrets. Never import from client components. */
export function serverEnv() {
  return {
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

export const settings = {
  /** Hours a temporary password remains valid before it must be re-issued. */
  tempPasswordTtlHours: Number(process.env.TEMP_PASSWORD_TTL_HOURS || 72),
  /** Send Supabase invite emails to each member after a successful registration. */
  autoInviteOnRegistration: process.env.AUTO_INVITE_ON_REGISTRATION === "true",
  /** Signed URL lifetime for private files (PDFs, attachments). */
  signedUrlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS || 300),
};
