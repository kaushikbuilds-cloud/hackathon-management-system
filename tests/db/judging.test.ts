import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("judging (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  let teamA: string;
  let teamB: string;
  let pending: string;
  let idea: string;
  let demo: string;
  const u: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    teamA = (await register(pool, payload("Alpha Judged", ["a1@judge.dev", "a2@judge.dev"]))).team_id!;
    teamB = (await register(pool, payload("Beta Judged", ["b1@judge.dev", "b2@judge.dev"]))).team_id!;
    pending = (await register(pool, payload("Gamma Pending", ["g1@judge.dev", "g2@judge.dev"]))).team_id!;
    await pool.query("update teams set status = 'approved' where id = any($1)", [[teamA, teamB]]);
    await pool.query("update teams set status = 'pending' where id = $1", [pending]);
    u.admin = await createUser(pool, "admin");
    u.judge1 = await createUser(pool, "official", {}, ["judge_teams"]);
    u.judge2 = await createUser(pool, "official", {}, ["judge_teams"]);
    u.official = await createUser(pool, "official");
    idea = (await pool.query("insert into judging_criteria (hackathon_id, name, max_points, sort_order) values ($1, 'Idea', 10, 1) returning id", [hA])).rows[0].id;
    demo = (await pool.query("insert into judging_criteria (hackathon_id, name, max_points, sort_order) values ($1, 'Demo', 5, 2) returning id", [hA])).rows[0].id;
  });
  afterAll(async () => db?.drop());

  const submit = (who: string, team: string, scores: Record<string, unknown>) =>
    as(pool, who, async (c) => (await c.query("select submit_judge_score($1, $2, 'nice') as r", [team, JSON.stringify(scores)])).rows[0].r);

  it("only judges can score, and only while judging is open", async () => {
    expect(await pgErrorCode(submit(u.official, teamA, { [idea]: 5, [demo]: 3 }))).toBe("42501");
    expect(await submit(u.judge1, teamA, { [idea]: 5, [demo]: 3 })).toMatchObject({ ok: false, message: "Judging is closed right now." });
    await pool.query("update hackathons set judging_open = true where id = $1", [hA]);
    expect(await submit(u.judge1, teamA, { [idea]: 8, [demo]: 4 })).toEqual({ ok: true, total: 12 });
  });

  it("scores must be whole numbers within each criterion's range, for approved teams", async () => {
    expect((await submit(u.judge1, teamA, { [idea]: 11, [demo]: 4 })).message).toBe("Give Idea a whole number from 0 to 10.");
    expect((await submit(u.judge1, teamA, { [idea]: 7.5, [demo]: 4 })).message).toBe("Give Idea a whole number from 0 to 10.");
    expect((await submit(u.judge1, teamA, { [idea]: 7 })).message).toBe("Give Demo a whole number from 0 to 5.");
    expect((await submit(u.judge1, pending, { [idea]: 7, [demo]: 2 })).message).toBe("Only approved teams can be scored.");
  });

  it("a judge sees only their own scores; the leaderboard averages across judges", async () => {
    await submit(u.judge2, teamA, { [idea]: 6, [demo]: 2 });   // teamA: 12 and 8 → 10
    await submit(u.judge2, teamB, { [idea]: 10, [demo]: 5 });  // teamB: 15
    await submit(u.judge2, teamB, { [idea]: 9, [demo]: 5 });   // re-scoring replaces: 14
    expect(await as(pool, u.judge1, async (c) => (await c.query("select judge_id from judge_scores")).rows)).toEqual([{ judge_id: u.judge1 }]);
    expect(await as(pool, u.judge1, async (c) => (await c.query("select * from judging_leaderboard()")).rowCount)).toBe(0);

    const board = await as(pool, u.admin, async (c) => (await c.query("select team_id, judges, avg_total, criteria from judging_leaderboard()")).rows);
    const scored = board.filter((r) => r.judges > 0);
    expect(scored.map((r) => [r.team_id, r.judges, Number(r.avg_total)])).toEqual([[teamB, 1, 14], [teamA, 2, 10]]);
    expect(Number(scored[1].criteria[idea])).toBe(7);
    // Unscored approved teams are listed after the scored ones.
    expect(board.slice(0, 2).map((r) => r.team_id)).toEqual([teamB, teamA]);
    expect(board.some((r) => r.team_id === pending)).toBe(false);
  });

  it("scores cannot be written directly, and criteria are managed only by judging managers", async () => {
    expect(await pgErrorCode(as(pool, u.judge1, (c) => c.query("update judge_scores set scores = '{}'")))).toBe("42501");
    expect(await as(pool, u.judge1, async (c) => (await c.query("update judging_criteria set max_points = 100")).rowCount)).toBe(0);
    expect(await as(pool, u.admin, async (c) => (await c.query("update judging_criteria set max_points = 20 where id = $1", [idea])).rowCount)).toBe(1);
  });
});
