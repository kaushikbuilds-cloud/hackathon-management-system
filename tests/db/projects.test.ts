import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const REPO = "https://github.com/acme/smart-bins";

describe.skipIf(!enabled)("project submissions (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  let teamA: string;
  let teamB: string;
  const u: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    teamA = (await register(pool, payload("Project Alpha", ["pa1@proj.dev", "pa2@proj.dev"]))).team_id!;
    teamB = (await register(pool, payload("Project Beta", ["pb1@proj.dev", "pb2@proj.dev"]))).team_id!;
    await pool.query("update teams set status = 'approved' where id = any($1)", [[teamA, teamB]]);
    for (const [k, team] of [["teamA", teamA], ["teamB", teamB]] as const) {
      u[k] = await createUser(pool, "participant");
      await pool.query("update profiles set team_id = $1 where id = $2", [team, u[k]]);
    }
    u.official = await createUser(pool, "official");
    u.judge = await createUser(pool, "official", {}, ["judge_teams"]);
  });
  afterAll(async () => db?.drop());

  const save = (who: string, repo = REPO) =>
    as(pool, who, async (c) => (await c.query("select save_project('Smart Bins', 'Bins that tell the council when they are full.', $1, 'https://bins.example.com', '') as r", [repo])).rows[0].r);

  it("teams submit only while submissions are open and before the deadline", async () => {
    expect(await save(u.teamA)).toEqual({ ok: false, message: "Project submissions are closed." });
    await pool.query("update hackathons set projects_open = true, projects_deadline = now() - interval '1 minute' where id = $1", [hA]);
    expect(await save(u.teamA)).toEqual({ ok: false, message: "Project submissions are closed." });
    await pool.query("update hackathons set projects_deadline = now() + interval '1 day' where id = $1", [hA]);
    expect(await save(u.teamA)).toEqual({ ok: true });
    expect(await save(u.teamA)).toEqual({ ok: true }); // editing replaces
    const { rows } = await pool.query("select title, demo_url, video_url, submitted_by from project_submissions where team_id = $1", [teamA]);
    expect(rows).toEqual([{ title: "Smart Bins", demo_url: "https://bins.example.com", video_url: null, submitted_by: u.teamA }]);
  });

  it("the repository must be a GitHub, GitLab or Bitbucket project link", async () => {
    for (const bad of ["https://example.com/acme/x", "github.com/acme/x", "https://github.com/acme", "https://github.com/acme/x/y z"]) {
      expect((await save(u.teamB, bad)).ok).toBe(false);
    }
    expect(await save(u.teamB, "https://gitlab.com/acme/smart-bins/")).toEqual({ ok: true });
  });

  it("only approved teams submit; staff without access cannot", async () => {
    await pool.query("update teams set status = 'pending' where id = $1", [teamB]);
    expect(await save(u.teamB)).toEqual({ ok: false, message: "Only approved teams can submit a project." });
    await pool.query("update teams set status = 'approved' where id = $1", [teamB]);
    expect(await pgErrorCode(save(u.official))).toBe("42501");
  });

  it("a team sees only its own project; judges see all; writes go through save_project()", async () => {
    const seen = (who: string) => as(pool, who, async (c) => (await c.query("select team_id from project_submissions order by team_id")).rows.map((r) => r.team_id));
    expect(await seen(u.teamA)).toEqual([teamA]);
    expect((await seen(u.judge)).sort()).toEqual([teamA, teamB].sort());
    expect(await seen(u.official)).toEqual([]);
    expect(await pgErrorCode(as(pool, u.teamA, (c) => c.query("update project_submissions set title = 'x'")))).toBe("42501");
  });
});
