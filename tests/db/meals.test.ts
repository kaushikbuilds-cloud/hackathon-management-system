import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("meal tracking (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  let lunch: string;
  let dinner: string;
  const tok: Record<string, string> = {};
  const u: Record<string, string> = {};

  const serve = (who: string, meal: string, token: string | null, participant: string | null = null) =>
    as(pool, who, async (c) => (await c.query("select serve_meal($1, $2, $3) as r", [meal, token, participant])).rows[0].r);

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    await register(pool, payload("Meal Eaters", ["m1@meal.dev", "m2@meal.dev"]));
    const rej = await register(pool, payload("Rejected Eaters", ["x1@meal.dev", "x2@meal.dev"]));
    await pool.query("update teams set status = 'rejected' where id = $1", [rej.team_id]);
    for (const e of ["m1", "m2", "x1"]) {
      const { rows: [p] } = await pool.query("select id, qr_token from participants where email = $1", [`${e}@meal.dev`]);
      tok[e] = p.qr_token;
      tok[`${e}id`] = p.id;
    }
    u.p1 = await createUser(pool, "participant", { participant_id: tok.m1id });
    u.counter = await createUser(pool, "official", {}, ["manage_food"]);
    u.gate = await createUser(pool, "official");
    await as(pool, u.counter, async (c) => {
      lunch = (await c.query("insert into meals (hackathon_id, name, is_open) values ($1, 'Day 1 Lunch', true) returning id", [hA])).rows[0].id;
      dinner = (await c.query("insert into meals (hackathon_id, name) values ($1, 'Day 1 Dinner') returning id", [hA])).rows[0].id;
    });
  });
  afterAll(async () => db?.drop());

  it("serves once per person per meal; a second scan says already served", async () => {
    const first = await serve(u.counter, lunch, tok.m1);
    expect(first).toMatchObject({ state: "served", meal: "Day 1 Lunch", served: 1, participant: { full_name: expect.any(String) } });
    const again = await serve(u.counter, lunch, tok.m1);
    expect(again.state).toBe("already");
    expect(Number((await pool.query("select count(*) from meal_servings where meal_id = $1", [lunch])).rows[0].count)).toBe(1);
  });

  it("refuses closed meals, unknown or cancelled cards, and rejected teams", async () => {
    expect((await serve(u.counter, dinner, tok.m2)).state).toBe("closed");
    expect((await serve(u.counter, lunch, "0".repeat(64))).state).toBe("invalid");
    expect((await serve(u.counter, lunch, tok.x1)).state).toBe("rejected");
    await pool.query("update participants set qr_revoked_at = now() where id = $1", [tok.m2id]);
    expect((await serve(u.counter, lunch, tok.m2)).state).toBe("invalid");
    // Name search still works for a person whose card was cancelled (staff verified them).
    expect((await serve(u.counter, lunch, null, tok.m2id)).state).toBe("served");
    await pool.query("update participants set qr_revoked_at = null where id = $1", [tok.m2id]);
  });

  it("only staff with Food orders can serve or undo; a card from another hackathon is invalid", async () => {
    expect(await pgErrorCode(serve(u.gate, lunch, tok.m1))).toBe("42501");
    expect(await pgErrorCode(serve(u.p1, lunch, tok.m1))).toBe("42501");
    const hB = (await pool.query("insert into hackathons (name) values ('Other Meal Hack') returning id")).rows[0].id;
    const counterB = await createUser(pool, "official", {}, ["manage_food"]);
    await pool.query("update profiles set hackathon_id = $1 where id = $2", [hB, counterB]);
    const mealB = await as(pool, counterB, async (c) => (await c.query("insert into meals (hackathon_id, name, is_open) values ($1, 'Lunch', true) returning id", [hB])).rows[0].id);
    expect((await serve(counterB, mealB, tok.m1)).state).toBe("invalid");
    expect((await serve(counterB, lunch, tok.m1)).state).toBe("invalid"); // cannot use another hackathon's meal
    await as(pool, counterB, async (c) => { expect((await c.query("select 1 from meal_servings")).rowCount).toBe(0); });
  });

  it("teams see their own members' meals; counts ignore rejected teams; undo lets them eat again", async () => {
    const mine = await as(pool, u.p1, async (c) => (await c.query("select participant_id from meal_servings")).rows);
    expect(mine.map((r) => r.participant_id).sort()).toEqual([tok.m1id, tok.m2id].sort());
    const eligible = await as(pool, u.counter, async (c) => Number((await c.query("select meal_eligible_count() as n")).rows[0].n));
    expect(eligible).toBe(Number((await pool.query("select count(*) from participants p join teams t on t.id = p.team_id where t.status <> 'rejected'")).rows[0].count));
    const { rows: [s] } = await pool.query("select id from meal_servings where meal_id = $1 and participant_id = $2", [lunch, tok.m1id]);
    expect(await as(pool, u.gate, async (c) => pgErrorCode(c.query("select undo_meal_serving($1)", [s.id])))).toBe("42501");
    expect(await as(pool, u.counter, async (c) => (await c.query("select undo_meal_serving($1) as ok", [s.id])).rows[0].ok)).toBe(true);
    expect((await serve(u.counter, lunch, tok.m1)).state).toBe("served");
  });
});
