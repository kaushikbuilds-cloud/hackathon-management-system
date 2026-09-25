import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("roles & permissions v2 (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let teamId: string;
  let leaderId: string;
  const u: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    const r = await register(pool, payload("Perm Testers", ["pt1@t.dev", "pt2@t.dev"]));
    teamId = r.team_id!;
    leaderId = (await pool.query("select id from participants where email = 'pt1@t.dev'")).rows[0].id;
    u.superAdmin = await createUser(pool, "super_admin");
    u.admin = await createUser(pool, "admin"); // default admin grants (no manage_officials)
    u.adminOfficials = await createUser(pool, "admin", {}, ["manage_officials"]);
    u.official = await createUser(pool, "official"); // default: QR check-in only
    u.officialManual = await createUser(pool, "official", {}, ["manual_checkin"]);
    u.adminNarrow = await createUser(pool, "admin");
    await pool.query("delete from staff_permissions where profile_id = $1 and permission <> 'view_reports'", [u.adminNarrow]);
  });
  afterAll(async () => db?.drop());

  it("admins hold only granted permissions; the Super Admin holds all", async () => {
    const check = (who: string, perm: string) =>
      as(pool, who, async (c) => (await c.query("select has_permission($1) as ok", [perm])).rows[0].ok as boolean);
    expect(await check(u.superAdmin, "manage_officials")).toBe(true);
    expect(await check(u.admin, "manage_officials")).toBe(false);
    expect(await check(u.adminOfficials, "manage_officials")).toBe(true);
    expect(await check(u.adminNarrow, "manage_event")).toBe(false);
    expect(await check(u.official, "record_attendance")).toBe(true);
    expect(await check(u.official, "manual_checkin")).toBe(false);
  });

  it("rejects grants that do not fit the role", async () => {
    expect(await pgErrorCode(pool.query("insert into staff_permissions (profile_id, permission) values ($1, 'manage_officials')", [u.official]))).toBe("23514");
    expect(await pgErrorCode(pool.query("insert into staff_permissions (profile_id, permission) values ($1, 'view_participants')", [u.official]))).toBe("23514");
  });

  it("changing a role drops grants that no longer apply", async () => {
    const tmp = await createUser(pool, "admin");
    await pool.query("update profiles set role = 'official' where id = $1", [tmp]);
    const { rows } = await pool.query("select permission from staff_permissions where profile_id = $1 order by 1", [tmp]);
    const left = rows.map((r) => r.permission);
    expect(left).not.toContain("manage_event");
    expect(left).not.toContain("view_participants");
    expect(left).toContain("record_attendance");
  });

  it("enforces event, registration and approval permissions", async () => {
    await as(pool, u.adminNarrow, async (c) => {
      expect((await c.query("update hackathons set venue = 'Nope'")).rowCount).toBe(0);
      expect((await c.query("update registration_forms set title = 'Nope'")).rowCount).toBe(0);
    });
    const editor = await createUser(pool, "official", {}, ["edit_registrations"]);
    await as(pool, editor, async (c) => {
      expect((await c.query("update teams set college = 'Fixed' where id = $1", [teamId])).rowCount).toBe(1);
    }, { rollback: true });
    // Correcting details is allowed, approving is not.
    expect(await pgErrorCode(as(pool, editor, (c) => c.query("update teams set status = 'rejected', status_reason = 'x' where id = $1", [teamId])))).toBe("42501");
    await as(pool, u.admin, async (c) => {
      expect((await c.query("update teams set status = 'flagged', status_reason = 'check' where id = $1", [teamId])).rowCount).toBe(1);
    }, { rollback: true });
  });

  it("officials never read participant rows directly (data minimisation)", async () => {
    await as(pool, u.officialManual, async (c) => {
      expect((await c.query("select * from participants")).rowCount).toBe(0);
      expect((await c.query("select * from profiles where role = 'participant'")).rowCount).toBe(0);
      const found = await c.query("select * from lookup_participants('Person')");
      expect(found.rowCount).toBeGreaterThan(0);
      expect(Object.keys(found.rows[0])).not.toContain("email");
      expect(Object.keys(found.rows[0])).not.toContain("phone");
    });
    expect(await pgErrorCode(as(pool, u.official, (c) => c.query("select * from lookup_participants('Person')")))).toBe("42501");
  });

  it("QR check-in and manual check-in are separate permissions", async () => {
    expect(await pgErrorCode(as(pool, u.official, (c) => c.query("select check_in($1, 'manual')", [leaderId])))).toBe("42501");
    const ok = await as(pool, u.official, async (c) => (await c.query("select check_in($1, 'qr') as r", [leaderId])).rows[0].r);
    expect(ok.ok).toBe(true);
    // Officials see their own check-ins, not everybody's, without view_attendance.
    await as(pool, u.officialManual, async (c) => {
      expect((await c.query("select * from attendance")).rowCount).toBe(0);
    });
    await as(pool, u.official, async (c) => {
      expect((await c.query("select * from attendance")).rowCount).toBe(1);
    });
  });

  it("suspended and deactivated accounts lose access immediately", async () => {
    for (const status of ["suspended", "deactivated"]) {
      await pool.query("update profiles set status = $2 where id = $1", [u.admin, status]);
      await as(pool, u.admin, async (c) => {
        expect((await c.query("select has_permission('view_participants') as ok")).rows[0].ok).toBe(false);
        expect((await c.query("select * from teams")).rowCount).toBe(0);
      });
      expect((await pool.query("select is_active from profiles where id = $1", [u.admin])).rows[0].is_active).toBe(false);
    }
    await pool.query("update profiles set status = 'active' where id = $1", [u.admin]);
    expect((await pool.query("select is_active from profiles where id = $1", [u.admin])).rows[0].is_active).toBe(true);
  });

  it("only the Super Admin and Officials-managers can read invitations; tokens stay out of the audit log", async () => {
    const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
    await pool.query(
      `insert into invitations (role, email, token_hash, expires_at, invited_by) values ('official', 'inv@t.dev', $1, now() + interval '1 day', $2),
                                                                                         ('admin', 'inv-admin@t.dev', $3, now() + interval '1 day', $2)`,
      [hash, u.superAdmin, createHash("sha256").update(randomBytes(32)).digest("hex")],
    );
    await as(pool, u.admin, async (c) => expect((await c.query("select * from invitations")).rowCount).toBe(0));
    await as(pool, u.adminOfficials, async (c) => {
      const { rows } = await c.query("select role from invitations");
      expect(rows.map((r) => r.role)).toEqual(["official"]);
    });
    await as(pool, u.superAdmin, async (c) => expect((await c.query("select * from invitations")).rowCount).toBe(2));
    const leaked = await pool.query("select count(*)::int as n from audit_logs where details::text like '%' || $1 || '%'", [hash]);
    expect(leaked.rows[0].n).toBe(0);
  });

  it("audit logs: full view for the Super Admin, registration history for editors", async () => {
    await as(pool, u.superAdmin, async (c) => {
      const { rows } = await c.query("select distinct entity_type from audit_logs");
      expect(rows.length).toBeGreaterThan(2);
    });
    await as(pool, u.admin, async (c) => {
      const { rows } = await c.query("select distinct entity_type from audit_logs");
      expect(rows.every((r) => ["teams", "participants"].includes(r.entity_type))).toBe(true);
    });
  });

  it("dashboard statistics require view_reports and contain no personal data", async () => {
    const stats = await as(pool, u.adminNarrow, async (c) => (await c.query("select dashboard_stats() as s")).rows[0].s);
    expect(stats.teams).toBeGreaterThan(0);
    expect(JSON.stringify(stats)).not.toContain("@");
    expect(await pgErrorCode(as(pool, u.official, (c) => c.query("select dashboard_stats()")))).toBe("42501");
  });
  it("activation codes are invisible to every signed-in role and anonymous visitors", async () => {
    await pool.query("insert into participant_activation_codes (participant_id, code) values ($1, 'X7K9M2Q4') on conflict do nothing", [leaderId]);
    for (const who of [u.superAdmin, u.admin, u.official, null]) {
      expect(await pgErrorCode(as(pool, who, (c) => c.query("select * from participant_activation_codes")))).toBe("42501");
    }
    expect(await pgErrorCode(pool.query("insert into participant_activation_codes (participant_id, code) values ($1, 'bad0code')", [leaderId]))).toBe("23514");
  });
});
