/**
 * DEVELOPMENT ONLY: creates demo accounts in a local/dev Supabase project.
 *   npm run seed:users            (reads .env.local)
 * Creates: a super admin, an admin, an official, and a participant login for
 * the leader of the seeded "Code Ninjas" team. Idempotent: existing emails are skipped.
 * Passwords are generated (or taken from SEED_SUPER_ADMIN_PASSWORD) and printed once.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo users with NODE_ENV=production.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function password() {
  return `Dev-${randomBytes(9).toString("base64url")}!7`;
}

async function findUser(email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(email: string, fullName: string, appMeta: Record<string, unknown>, pw = password()) {
  const existing = await findUser(email);
  if (existing) {
    console.log(`• ${email} already exists — skipped`);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: appMeta });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  console.log(`• ${String(appMeta.role).padEnd(11)} ${email.padEnd(34)} password: ${pw}`);
  return data.user.id;
}

async function main() {
  console.log("Creating demo accounts (development only)…\n");
  await ensureUser(process.env.SEED_SUPER_ADMIN_EMAIL || "superadmin@example.com", "Sam Super", { role: "super_admin" }, process.env.SEED_SUPER_ADMIN_PASSWORD || password());
  await ensureUser("admin@example.com", "Asha Admin", { role: "admin" });
  const officialId = await ensureUser("official@example.com", "Omar Official", { role: "official" });
  await supabase.from("official_permissions").upsert({ profile_id: officialId, can_generate_pdf: true, can_correct_attendance: false, can_edit_registrations: false, can_manage_all_support: false });

  const { data: leader } = await supabase.from("participants").select("id, email, full_name").eq("email", "aarav.sharma@example.edu").maybeSingle();
  if (leader) {
    await ensureUser(leader.email, leader.full_name, { role: "participant", participant_id: leader.id });
  } else {
    console.log("• Seed team not found (run the SQL seed first) — participant login skipped");
  }
  console.log("\nStore these passwords now; they are not saved anywhere.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
