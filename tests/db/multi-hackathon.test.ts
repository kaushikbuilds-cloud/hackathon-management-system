import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("multiple hackathons (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  let hB: string;
  let teamA: string;
  let teamB: string;
  let tokenB: string;
  let participantB: string;
  const u: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    // Staff created while there is one hackathon default to it.
    u.adminA = await createUser(pool, "admin");
    u.officialA = await createUser(pool, "official", {}, ["manual_checkin"]);
    u.superAdmin = await createUser(pool, "super_admin");

    hB = (await pool.query("insert into hackathons (name, organizer_name) values ('Second Hack 2027', 'Other College') returning id")).rows[0].id;
    await pool.query(
      `insert into registration_forms (hackathon_id, slug, title, status, min_team_size, max_team_size)
       values ($1, 'second-hack', 'Second Hack registration', 'published', 1, 4)`, [hB]);
    u.adminB = await createUser(pool, "admin");
    await pool.query("update profiles set hackathon_id = $1 where id = $2", [hB, u.adminB]);

    teamA = (await register(pool, payload("Same Name", ["a1@multi.dev", "a2@multi.dev"]))).team_id!;
    const rB = await register(pool, payload("Same Name", ["b1@multi.dev", "b2@multi.dev"]), null, "second-hack");
    expect(rB.ok).toBe(true);
    teamB = rB.team_id!;
    const pB = (await pool.query("select id, qr_token from participants where team_id = $1 order by participant_code limit 1", [teamB])).rows[0];
    participantB = pB.id;
    tokenB = pB.qr_token;
  });
  afterAll(async () => db?.drop());

  it("gives each hackathon a unique slug, and team names are unique per hackathon only", async () => {
    const { rows } = await pool.query("select slug from hackathons order by created_at");
    expect(rows.map((r) => r.slug)).toContain("second-hack-2027");
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
    const again = await pool.query("insert into hackathons (name) values ('Second Hack 2027') returning slug");
    expect(again.rows[0].slug).toBe("second-hack-2027-2");
    expect(teamA).not.toBe(teamB);
  });

  it("staff see only their own hackathon's teams, participants and profiles", async () => {
    await as(pool, u.adminA, async (c) => {
      const teams = await c.query("select hackathon_id from teams");
      expect(teams.rowCount).toBeGreaterThan(0);
      expect(teams.rows.every((r) => r.hackathon_id === hA)).toBe(true);
      expect((await c.query("select 1 from participants where team_id = $1", [teamB])).rowCount).toBe(0);
      expect((await c.query("select 1 from profiles where id = $1", [u.adminB])).rowCount).toBe(0);
      expect((await c.query("select 1 from team_overview where id = $1", [teamB])).rowCount).toBe(0);
    });
    await as(pool, u.adminB, async (c) => {
      const teams = await c.query("select id from teams");
      expect(teams.rows.map((r) => r.id)).toEqual([teamB]);
    });
  });

  it("staff cannot change another hackathon's data or settings", async () => {
    await as(pool, u.adminA, async (c) => {
      expect((await c.query("update teams set status = 'approved' where id = $1", [teamB])).rowCount).toBe(0);
      expect((await c.query("update hackathons set venue = 'Hijacked' where id = $1", [hB])).rowCount).toBe(0);
      expect((await c.query("update hackathons set venue = 'Hall A' where id = $1", [hA])).rowCount).toBe(1);
      expect(await pgErrorCode(c.query(
        "insert into announcements (hackathon_id, title, body, audience, status) values ($1, 'x', 'y', 'all', 'draft')", [hB]))).toBe("42501");
    }, { rollback: true });
    // Only the platform owner changes a hackathon's status.
    await as(pool, u.adminA, async (c) => {
      expect(await pgErrorCode(c.query("update hackathons set status = 'archived' where id = $1", [hA]))).toBe("42501");
    }, { rollback: true });
  });

  it("another hackathon's QR card is invalid at this event and cannot be checked in", async () => {
    await as(pool, u.officialA, async (c) => {
      const v = (await c.query("select verify_qr($1) as r", [tokenB])).rows[0].r;
      expect(v.state).toBe("invalid");
      const r = (await c.query("select check_in($1, 'manual') as r", [participantB])).rows[0].r;
      expect(r.ok).toBe(false);
      expect(r.code).toBe("not_found");
      expect((await c.query("select * from lookup_participants('b1@multi.dev')")).rowCount).toBe(0);
    });
  });

  it("the Super Admin sees platform data, and a hackathon's data only after opening it", async () => {
    await as(pool, u.superAdmin, async (c) => {
      expect((await c.query("select 1 from teams")).rowCount).toBe(0);
      const overview = (await c.query("select id, teams from platform_overview()")).rows;
      expect(overview.length).toBeGreaterThanOrEqual(2);
      expect(Number(overview.find((r) => r.id === hB).teams)).toBe(1);
      expect((await c.query("select 1 from profiles where id in ($1, $2)", [u.adminA, u.adminB])).rowCount).toBe(2);
    });
    await as(pool, u.superAdmin, async (c) => {
      const teams = await c.query("select id from teams");
      expect(teams.rows.map((r) => r.id)).toEqual([teamB]);
    }, { hackathon: hB });
    // The header is ignored for everyone else.
    await as(pool, u.adminA, async (c) => {
      expect((await c.query("select 1 from teams where id = $1", [teamB])).rowCount).toBe(0);
    }, { hackathon: hB });
    await as(pool, u.adminA, async (c) => {
      expect(await pgErrorCode(c.query("select * from platform_overview()"))).toBe("42501");
    });
  });

  it("new rows are stamped with their hackathon automatically", async () => {
    const r = await pool.query("select hackathon_id from registration_submissions where team_id = $1", [teamB]);
    expect(r.rows[0].hackathon_id).toBe(hB);
    const pr = await pool.query(
      "insert into auth.users (id, email, raw_app_meta_data) values (gen_random_uuid(), 'b1-login@multi.dev', $1) returning id",
      [JSON.stringify({ role: "participant", participant_id: participantB })]);
    const prof = await pool.query("select hackathon_id from profiles where id = $1", [pr.rows[0].id]);
    expect(prof.rows[0].hackathon_id).toBe(hB);
  });
});
