import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("mentor help desk (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  const team: Record<string, string> = {};
  const u: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    for (const k of ["a", "b", "pending"]) {
      team[k] = (await register(pool, payload(`Mentor Team ${k}`, [`${k}1@mentor.dev`, `${k}2@mentor.dev`]))).team_id!;
      u[k] = await createUser(pool, "participant");
      await pool.query("update profiles set team_id = $1 where id = $2", [team[k], u[k]]);
    }
    await pool.query("update teams set status = 'approved' where id = any($1)", [[team.a, team.b]]);
    await pool.query("update teams set status = 'pending' where id = $1", [team.pending]);
    const member = (await pool.query("select id from participants where email = 'a2@mentor.dev'")).rows[0].id;
    u.member = await createUser(pool, "participant", { participant_id: member });
    u.mentor1 = await createUser(pool, "official", {}, ["mentor_teams"]);
    await pool.query("update profiles set full_name = 'Maya Mentor' where id = $1", [u.mentor1]);
    u.mentor2 = await createUser(pool, "official", {}, ["mentor_teams"]);
    u.official = await createUser(pool, "official");
    u.admin = await createUser(pool, "admin");
  });
  afterAll(async () => db?.drop());

  const ask = (who: string, topic = "Backend", details = "Our API returns 500 on login") =>
    as(pool, who, async (c) => (await c.query("select request_mentor($1, $2, 'Table 12') as r", [topic, details])).rows[0].r);
  const act = (who: string, id: string, action: string) =>
    as(pool, who, async (c) => (await c.query("select mentor_request_action($1, $2) as r", [id, action])).rows[0].r);
  const visible = (who: string) => as(pool, who, async (c) => (await c.query("select team_id, status from mentor_requests order by created_at")).rows);

  it("teams can ask only while the desk is open, and only approved teams", async () => {
    expect(await ask(u.a)).toEqual({ ok: false, message: "The mentor desk is closed right now." });
    await pool.query("update hackathons set mentor_desk_open = true where id = $1", [hA]);
    expect(await ask(u.pending)).toEqual({ ok: false, message: "Only approved teams can ask for a mentor." });
    expect(await ask(u.a, "Blockchain")).toMatchObject({ ok: false });
    expect(await ask(u.a)).toMatchObject({ ok: true });
    // Any member may ask, but a team has one open request at a time.
    expect(await ask(u.member, "Design", "Colours look off")).toEqual({ ok: false, message: "Your team already has an open request. Cancel it to ask about something else." });
    expect(await ask(u.b, "Design", "Help us with the landing page")).toMatchObject({ ok: true });
  });

  it("teams see only their own requests; mentors see the queue; others see nothing", async () => {
    expect((await visible(u.a)).map((r) => r.team_id)).toEqual([team.a]);
    expect(await visible(u.member)).toHaveLength(1);
    expect(await visible(u.mentor1)).toHaveLength(2);
    expect(await visible(u.admin)).toHaveLength(2); // admins get the permission by default
    expect(await visible(u.official)).toHaveLength(0);
    expect(await pgErrorCode(act(u.official, "00000000-0000-0000-0000-000000000000", "claim"))).toBe("42501");
  });

  it("one mentor claims a request; the team is notified; a second mentor cannot take it", async () => {
    const id = (await pool.query("select id from mentor_requests where team_id = $1", [team.a])).rows[0].id;
    expect(await act(u.mentor1, id, "claim")).toMatchObject({ ok: true });
    expect(await act(u.mentor2, id, "claim")).toMatchObject({ ok: false });
    expect(await act(u.mentor2, id, "done")).toEqual({ ok: false, message: "That request is not being handled by you." });
    const n = (await pool.query("select title, body from notifications where team_id = $1 order by created_at desc limit 1", [team.a])).rows[0];
    expect(n).toEqual({ title: "A mentor is on the way", body: "Maya Mentor is coming to help with Backend." });
    // Handing it back puts it in the queue again; then another mentor finishes it.
    expect(await act(u.mentor1, id, "release")).toMatchObject({ ok: true });
    expect((await pool.query("select status, mentor_id from mentor_requests where id = $1", [id])).rows[0]).toEqual({ status: "waiting", mentor_id: null });
    expect(await act(u.mentor2, id, "claim")).toMatchObject({ ok: true });
    expect(await act(u.mentor2, id, "done")).toMatchObject({ ok: true });
    const done = (await pool.query("select status, mentor_id, closed_at is not null as closed from mentor_requests where id = $1", [id])).rows[0];
    expect(done).toEqual({ status: "done", mentor_id: u.mentor2, closed: true });
    // With the old one closed, the team can ask again.
    expect(await ask(u.a, "Deployment", "Vercel build fails")).toMatchObject({ ok: true });
  });

  it("a team cancels its own request only; nobody writes the table directly", async () => {
    const id = (await pool.query("select id from mentor_requests where team_id = $1 and status = 'waiting'", [team.b])).rows[0].id;
    expect(await as(pool, u.a, async (c) => (await c.query("select cancel_mentor_request($1) as r", [id])).rows[0].r)).toMatchObject({ ok: false });
    expect(await as(pool, u.b, async (c) => (await c.query("select cancel_mentor_request($1) as r", [id])).rows[0].r)).toEqual({ ok: true });
    expect(await pgErrorCode(as(pool, u.mentor1, (c) => c.query("update mentor_requests set status = 'done'")))).toBe("42501");
  });
});
