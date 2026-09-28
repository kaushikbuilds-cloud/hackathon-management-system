import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("ending a hackathon and certificates (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  const u: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    const a = await register(pool, payload("Finishers", ["e1@end.dev", "e2@end.dev"]));
    const b = await register(pool, payload("Rejected Ones", ["r1@end.dev", "r2@end.dev"]));
    await pool.query("update teams set status = 'rejected' where id = $1", [b.team_id]);
    await pool.query("update teams set award = 'Winner' where id = $1", [a.team_id]);
    // e1 and r1 checked in; e2 did not.
    for (const email of ["e1@end.dev", "r1@end.dev"]) {
      const { rows: [p] } = await pool.query("select id, team_id, hackathon_id from participants where email = $1", [email]);
      await pool.query("insert into attendance (participant_id, team_id, hackathon_id, status, method, session_key) values ($1, $2, $3, 'present', 'manual', 'main')", [p.id, p.team_id, p.hackathon_id]);
    }
    await pool.query("insert into food_shops (hackathon_id, name, is_open) values ($1, 'Canteen', true)", [hA]);
    u.admin = await createUser(pool, "admin");
    u.official = await createUser(pool, "official");
    u.superAdmin = await createUser(pool, "super_admin");
  });
  afterAll(async () => db?.drop());

  it("certificates go only to checked-in members of teams that were not rejected, with the team's award", async () => {
    const { rows } = await pool.query("select full_name, award from certificate_recipients where hackathon_id = $1", [hA]);
    const emails = (await pool.query("select full_name from participants where email = 'e1@end.dev'")).rows[0].full_name;
    expect(rows).toEqual([{ full_name: emails, award: "Winner" }]);
    // Staff without participant access see nothing through the view.
    expect(await as(pool, u.official, async (c) => (await c.query("select 1 from certificate_recipients")).rowCount)).toBe(0);
  });

  it("the Admin cannot change the status directly, and officials cannot end the hackathon", async () => {
    expect(await pgErrorCode(as(pool, u.admin, (c) => c.query("update hackathons set status = 'completed' where id = $1", [hA])))).toBe("42501");
    expect(await pgErrorCode(as(pool, u.official, (c) => c.query("select end_hackathon()")))).toBe("42501");
  });

  it("the Admin ends it: forms and food shops close; only the Super Admin can reopen", async () => {
    expect(await as(pool, u.admin, async (c) => (await c.query("select end_hackathon() as ok")).rows[0].ok)).toBe(true);
    const { rows: [h] } = await pool.query("select status, ended_at, ended_by from hackathons where id = $1", [hA]);
    expect(h.status).toBe("completed");
    expect(h.ended_at).not.toBeNull();
    expect(h.ended_by).toBe(u.admin);
    expect((await pool.query("select count(*) from registration_forms where hackathon_id = $1 and status = 'published'", [hA])).rows[0].count).toBe("0");
    expect((await pool.query("select count(*) from food_shops where hackathon_id = $1 and is_open", [hA])).rows[0].count).toBe("0");
    expect(await as(pool, u.admin, async (c) => (await c.query("select end_hackathon() as ok")).rows[0].ok)).toBe(false); // already ended

    expect(await pgErrorCode(as(pool, u.admin, (c) => c.query("select reopen_hackathon($1)", [hA])))).toBe("42501");
    expect(await as(pool, u.superAdmin, async (c) => (await c.query("select reopen_hackathon($1) as ok", [hA])).rows[0].ok)).toBe(true);
    expect((await pool.query("select status, ended_at from hackathons where id = $1", [hA])).rows[0]).toEqual({ status: "active", ended_at: null });
  });
});
