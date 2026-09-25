import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("FAQ (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  let hB: string;
  const u: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    await register(pool, payload("Curious Cats", ["q1@faq.dev", "q2@faq.dev"]));
    const p1 = (await pool.query("select id from participants where email = 'q1@faq.dev'")).rows[0].id;
    u.team = await createUser(pool, "participant", { participant_id: p1 });
    u.admin = await createUser(pool, "admin");
    u.official = await createUser(pool, "official");
    hB = (await pool.query("insert into hackathons (name) values ('Other FAQ Hack') returning id")).rows[0].id;
    u.adminB = await createUser(pool, "admin");
    await pool.query("update profiles set hackathon_id = $1 where id = $2", [hB, u.adminB]);
    await as(pool, u.admin, async (c) => {
      await c.query(
        `insert into hackathon_faqs (hackathon_id, question, answer, audience, is_published) values
          ($1, 'Public answer?', 'Yes', 'public', true),
          ($1, 'Teams only?', 'Yes', 'participants', true),
          ($1, 'Draft question?', 'Not yet', 'public', false)`, [hA]);
    });
  });
  afterAll(async () => db?.drop());

  const questions = async (who: string | null) =>
    (await as(pool, who, async (c) => (await c.query("select question from hackathon_faqs order by question")).rows)).map((r) => r.question as string);

  it("visitors see only published public answers", async () => {
    expect(await questions(null)).toEqual(["Public answer?"]);
  });

  it("the hackathon's teams also see team-only answers, never drafts", async () => {
    expect(await questions(u.team)).toEqual(["Public answer?", "Teams only?"]);
    expect(await questions(u.official)).toEqual(["Public answer?", "Teams only?"]);
  });

  it("editors see drafts; another hackathon's admin sees only public answers and cannot edit", async () => {
    expect(await questions(u.admin)).toEqual(["Draft question?", "Public answer?", "Teams only?"]);
    expect(await questions(u.adminB)).toEqual(["Public answer?"]);
    await as(pool, u.adminB, async (c) => {
      expect((await c.query("update hackathon_faqs set answer = 'hacked'")).rowCount).toBe(0);
    });
    expect(await pgErrorCode(as(pool, u.adminB, (c) => c.query(
      "insert into hackathon_faqs (hackathon_id, question, answer) values ($1, 'Sneaky?', 'x')", [hA])))).toBe("42501");
  });

  it("participants and officials cannot write answers", async () => {
    for (const who of [u.team, u.official]) {
      expect(await pgErrorCode(as(pool, who, (c) => c.query(
        "insert into hackathon_faqs (hackathon_id, question, answer) values ($1, 'Mine?', 'x')", [hA])))).toBe("42501");
      await as(pool, who, async (c) => { expect((await c.query("delete from hackathon_faqs")).rowCount).toBe(0); });
    }
  });
});
