import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, payload, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("public results (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  let slug: string;
  const team: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    ({ id: hA, slug } = (await pool.query("select id, slug from hackathons")).rows[0]);
    for (const k of ["gold", "design", "none", "rejected"]) {
      team[k] = (await register(pool, payload(`Res ${k}`, [`${k}1@res.dev`, `${k}2@res.dev`]))).team_id!;
    }
    await pool.query("update teams set status = 'approved' where id = any($1)", [[team.gold, team.design, team.none]]);
    await pool.query("update teams set status = 'rejected', award = 'Winner' where id = $1", [team.rejected]);
    await pool.query("update teams set award = 'Best Design' where id = $1", [team.design]);
    await pool.query("update teams set award = 'Winner' where id = $1", [team.gold]);
    await pool.query(`insert into project_submissions (team_id, hackathon_id, title, description, repo_url) values ($1, $2, 'Bin Buddy', 'Routes for waste trucks.', 'https://github.com/res/bin-buddy')`, [team.gold, hA]);
  });
  afterAll(async () => db?.drop());

  const results = () => as(pool, null, async (c) => (await c.query("select public_results($1) as r", [slug])).rows[0].r);

  it("shows nothing until the results are published", async () => {
    expect(await results()).toEqual({ published: false });
    expect(await as(pool, null, async (c) => (await c.query("select public_results('no-such-event') as r")).rows[0].r)).toEqual({ published: false });
  });

  it("lists only approved teams with an award, the Winner first, without contact details", async () => {
    await pool.query("update hackathons set results_published = true, results_published_at = now() where id = $1", [hA]);
    const r = await results();
    expect(r.published).toBe(true);
    expect(r.team_count).toBe(Number((await pool.query("select count(*) from teams where status = 'approved'")).rows[0].count));
    expect(r.winners.map((w: { team_name: string; award: string }) => [w.award, w.team_name])).toEqual([["Winner", "Res gold"], ["Best Design", "Res design"]]);
    expect(r.winners[0].project).toMatchObject({ title: "Bin Buddy", repo_url: "https://github.com/res/bin-buddy" });
    expect(r.winners[0].members).toHaveLength(2);
    expect(JSON.stringify(r)).not.toMatch(/@res\.dev|phone|score/);
  });

  it("hides them again when unpublished or the hackathon is archived", async () => {
    await pool.query("update hackathons set status = 'archived' where id = $1", [hA]);
    expect(await results()).toEqual({ published: false });
    await pool.query("update hackathons set status = 'active', results_published = false where id = $1", [hA]);
    expect(await results()).toEqual({ published: false });
  });
});
