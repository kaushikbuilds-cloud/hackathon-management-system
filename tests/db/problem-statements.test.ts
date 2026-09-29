import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("problem statements (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  const team: Record<string, string> = {};
  const u: Record<string, string> = {};
  let ps1: string;
  let ps2: string;
  let draft: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    for (const k of ["a", "b", "c"]) {
      team[k] = (await register(pool, payload(`PS Team ${k.toUpperCase()}`, [`${k}1@ps.dev`, `${k}2@ps.dev`]))).team_id!;
      u[k] = await createUser(pool, "participant");
      await pool.query("update profiles set team_id = $1 where id = $2", [team[k], u[k]]);
    }
    const member = (await pool.query("select id from participants where email = 'a2@ps.dev'")).rows[0].id;
    u.member = await createUser(pool, "participant", { participant_id: member });
    u.admin = await createUser(pool, "admin");
    const add = async (title: string, extra: string) =>
      (await pool.query(`insert into problem_statements (hackathon_id, title, description ${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, 'Solve it' ${extra ? ", " + extra.split("=")[1] : ""}) returning id, code`, [hA, title])).rows[0];
    const r1 = await add("Smart waste", "max_teams=1");
    const r2 = await add("Clean water", "");
    const r3 = await add("Secret draft", "");
    ps1 = r1.id; ps2 = r2.id; draft = r3.id;
    expect([r1.code, r2.code, r3.code]).toEqual(["PS01", "PS02", "PS03"]);
    await pool.query("update problem_statements set is_published = true where id = any($1)", [[ps1, ps2]]);
  });
  afterAll(async () => db?.drop());

  const choose = (who: string, id: string | null) => as(pool, who, async (c) => (await c.query("select choose_problem_statement($1) as r", [id])).rows[0].r);

  it("teams see only published statements; the public too", async () => {
    const titles = async (who: string | null) => (await as(pool, who, async (c) => (await c.query("select title from problem_statements order by code")).rows)).map((r) => r.title);
    expect(await titles(u.a)).toEqual(["Smart waste", "Clean water"]);
    expect(await titles(null)).toEqual(["Smart waste", "Clean water"]);
    expect(await titles(u.admin)).toEqual(["Smart waste", "Clean water", "Secret draft"]);
  });

  it("teams choose only while selection is open, and never a draft", async () => {
    expect(await choose(u.a, ps1)).toEqual({ ok: false, message: "Problem statement selection is closed." });
    await pool.query("update hackathons set ps_selection_open = true where id = $1", [hA]);
    expect(await choose(u.a, draft)).toEqual({ ok: false, message: "That problem statement is not available." });
    expect(await choose(u.a, ps1)).toEqual({ ok: true });
  });

  it("a statement with a team limit fills up; a team can switch or clear its choice", async () => {
    expect(await choose(u.b, ps1)).toEqual({ ok: false, message: "PS01 is full (1 teams). Please choose another one." });
    expect(await choose(u.b, ps2)).toEqual({ ok: true });
    expect(await choose(u.a, ps1)).toEqual({ ok: true }); // re-choosing your own full statement is fine
    expect(await choose(u.a, null)).toEqual({ ok: true });
    expect(await choose(u.c, ps1)).toEqual({ ok: true }); // freed up
    const taken = await as(pool, null, async (c) => (await c.query("select statement_id, teams from problem_statement_taken($1)", [hA])).rows);
    expect(Object.fromEntries(taken.map((r) => [r.statement_id, r.teams]))).toEqual({ [ps1]: 1, [ps2]: 1 });
  });

  it("only the team login or its leader chooses; teams cannot write statements", async () => {
    expect(await pgErrorCode(choose(u.member, ps2))).toBe("42501");
    expect(await as(pool, u.a, async (c) => (await c.query("update problem_statements set title = 'x'")).rowCount)).toBe(0);
    expect(await pgErrorCode(as(pool, u.a, (c) => c.query("insert into problem_statements (hackathon_id, title) values ($1, 'Mine')", [hA])))).toBe("42501");
  });
});
