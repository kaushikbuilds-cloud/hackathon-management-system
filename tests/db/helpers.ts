import { createHash } from "node:crypto";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(__dirname, "../..");

/**
 * Creates a throwaway database on TEST_DATABASE_URL's server, applies the
 * Supabase shim, every migration and the seed, and returns a pool for it.
 */
export async function createTestDatabase() {
  const adminUrl = process.env.TEST_DATABASE_URL!;
  const name = `hms_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 8 });
  const files = [
    path.join(ROOT, "supabase/tests/supabase-shim.sql"),
    ...readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(ROOT, "supabase/migrations", f)),
    path.join(ROOT, "supabase/seed.sql"),
  ];
  for (const f of files) await pool.query(readFileSync(f, "utf8"));
  // Keep the seeded form open regardless of the current date.
  await pool.query("update registration_forms set opens_at = null, closes_at = null");

  return {
    pool,
    async drop() {
      await pool.end();
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

export type Role = "super_admin" | "admin" | "official" | "participant";

/**
 * Inserts an auth user (the on_auth_user_created trigger creates the profile)
 * and, for staff, grants the role's default permissions plus `grants` — the
 * same thing accepting an invitation does in the app.
 */
export async function createUser(pool: pg.Pool, role: Role, extra: Record<string, unknown> = {}, grants: string[] = []) {
  const id = randomUUID();
  await pool.query("insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)", [
    id, `${role}-${id.slice(0, 8)}@test.local`, JSON.stringify({ role, ...extra }),
  ]);
  if (role === "admin" || role === "official") {
    await pool.query(
      `insert into staff_permissions (profile_id, permission)
       select $1, key from permissions where $2::app_role = any (default_for) or key = any ($3::text[])
       on conflict do nothing`,
      [id, role, grants],
    );
  }
  return id;
}

/**
 * Runs `fn` inside a transaction as an authenticated user (like PostgREST
 * does with a JWT), or as anon when userId is null. RLS applies.
 */
export async function as<T>(
  pool: pg.Pool, userId: string | null, fn: (c: pg.PoolClient) => Promise<T>, opts: { rollback?: boolean; hackathon?: string } = {},
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
    ]);
    if (opts.hackathon) {
      // What the app sends when the Super Admin opens a hackathon.
      await client.query("select set_config('request.headers', $1, true)", [JSON.stringify({ "x-hackathon-id": opts.hackathon })]);
    }
    await client.query(userId ? "set local role authenticated" : "set local role anon");
    const result = await fn(client);
    await client.query(opts.rollback ? "rollback" : "commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Expects the callback to fail with a Postgres error; returns its code. */
export async function pgErrorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
  throw new Error("Expected a database error");
}

/** A distinct, stable phone number per email (phones are unique across teams). */
export function phoneFor(email: string) {
  const n = parseInt(createHash("sha256").update(email).digest("hex").slice(0, 12), 16) % 1e10;
  return `+91 ${String(n).padStart(10, "0")}`;
}

export function payload(teamName: string, emails: string[], extra: Record<string, unknown> = {}) {
  return {
    team_name: teamName,
    college: "Test College",
    members: emails.map((email, i) => ({
      full_name: `Person ${String.fromCharCode(65 + i)}`,
      email,
      phone: phoneFor(email),
      department: "CS",
      academic_year: "1st Year",
      role: i === 0 ? "leader" : "member",
    })),
    ...extra,
  };
}

export async function register(pool: pg.Pool, p: unknown, key: string | null = null, slug = "buildfest-2026") {
  const { rows } = await pool.query("select public.register_team($1, $2, $3) as r", [slug, JSON.stringify(p), key]);
  return rows[0].r as { ok: boolean; code?: string; team_id?: string; team_code?: string; participant_codes?: string[]; replayed?: boolean };
}
