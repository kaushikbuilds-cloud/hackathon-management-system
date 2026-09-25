import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { createTestDatabase, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("registration (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
  });
  afterAll(async () => db?.drop());

  it("creates team and members atomically with generated IDs", async () => {
    const r = await register(pool, payload("Alpha Squad", ["a1@t.dev", "a2@t.dev", "a3@t.dev"]));
    expect(r.ok).toBe(true);
    expect(r.team_code).toMatch(/^TEAM-2026-\d{4,}$/);
    expect(r.participant_codes).toHaveLength(3);
    for (const c of r.participant_codes!) expect(c).toMatch(/^PRT-2026-\d{4,}$/);
    const { rows } = await pool.query("select role, qr_token from participants where team_id = $1 order by participant_code", [r.team_id]);
    expect(rows.filter((x) => x.role === "leader")).toHaveLength(1);
    expect(new Set(rows.map((x) => x.qr_token)).size).toBe(3);
    for (const x of rows) expect(x.qr_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique IDs across many registrations", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => register(pool, payload(`Bulk Team ${i}`, [`b${i}x@t.dev`, `b${i}y@t.dev`]))));
    expect(results.every((r) => r.ok)).toBe(true);
    const teamCodes = results.map((r) => r.team_code);
    const prtCodes = results.flatMap((r) => r.participant_codes!);
    expect(new Set(teamCodes).size).toBe(teamCodes.length);
    expect(new Set(prtCodes).size).toBe(prtCodes.length);
  });

  it("makes Team and Participant IDs immutable", async () => {
    const r = await register(pool, payload("Immutable Ones", ["i1@t.dev", "i2@t.dev"]));
    expect(await pgErrorCode(pool.query("update teams set team_code = 'TEAM-2026-9999' where id = $1", [r.team_id]))).toBe("23514");
    expect(await pgErrorCode(pool.query("update participants set participant_code = 'PRT-2026-9999' where team_id = $1", [r.team_id]))).toBe("23514");
  });

  it.each(["code ninjas", "  CODE   NINJAS  ", "Code\tNinjas"])("rejects duplicate team name variant %j", async (name) => {
    const r = await register(pool, payload(name, [`${name.length}d1@t.dev`, `${name.length}d2@t.dev`]));
    expect(r).toMatchObject({ ok: false, code: "duplicate_team_name" });
  });

  it("allows exactly one of two concurrent submissions with the same team name", async () => {
    const [a, b] = await Promise.all([
      register(pool, payload("Race Condition", ["r1@t.dev", "r2@t.dev"]), "race-key-aaaa"),
      register(pool, payload("race   condition", ["r3@t.dev", "r4@t.dev"]), "race-key-bbbb"),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((x) => !x.ok)?.code).toBe("duplicate_team_name");
    const { rows } = await pool.query("select count(*)::int as n from teams where name_key = 'race condition'");
    expect(rows[0].n).toBe(1);
  });

  it("is idempotent: retries with the same key return the original team", async () => {
    const p = payload("Retry Rangers", ["rr1@t.dev", "rr2@t.dev"]);
    const first = await register(pool, p, "idem-key-0001");
    const second = await register(pool, p, "idem-key-0001");
    expect(first.ok && second.ok).toBe(true);
    expect(second.replayed).toBe(true);
    expect(second.team_id).toBe(first.team_id);
    expect(second.participant_codes).toEqual(first.participant_codes);
  });

  it("is idempotent under concurrent retries", async () => {
    const p = payload("Double Clickers", ["dc1@t.dev", "dc2@t.dev"]);
    const results = await Promise.all([register(pool, p, "idem-key-0002"), register(pool, p, "idem-key-0002"), register(pool, p, "idem-key-0002")]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => r.team_id)).size).toBe(1);
    const { rows } = await pool.query("select count(*)::int as n from participants where email in ('dc1@t.dev','dc2@t.dev')");
    expect(rows[0].n).toBe(2);
  });

  it("prevents a participant from joining two teams (case-insensitive email)", async () => {
    const r = await register(pool, payload("Second Team", ["AARAV.SHARMA@example.edu", "st2@t.dev"]));
    expect(r).toMatchObject({ ok: false, code: "participant_already_registered" });
    const { rows } = await pool.query("select count(*)::int as n from teams where name = 'Second Team'");
    expect(rows[0].n).toBe(0); // rolled back atomically
  });

  it("enforces team size and leader rules server-side", async () => {
    expect(await register(pool, payload("Solo", ["solo@t.dev"]))).toMatchObject({ ok: false, code: "team_size" });
    expect(await register(pool, payload("Crowd", ["c1@t.dev", "c2@t.dev", "c3@t.dev", "c4@t.dev", "c5@t.dev"]))).toMatchObject({ ok: false, code: "team_size" });
    const noLeader = payload("Leaderless", ["l1@t.dev", "l2@t.dev"]);
    noLeader.members.forEach((m) => (m.role = "member"));
    expect(await register(pool, noLeader)).toMatchObject({ ok: false, code: "leader_count" });
    expect(await register(pool, payload("Twins", ["tw@t.dev", "TW@t.dev"]))).toMatchObject({ ok: false, code: "duplicate_member_email" });
  });

  it("rejects submissions when the form is closed or unpublished", async () => {
    await pool.query("update registration_forms set status = 'closed'");
    expect(await register(pool, payload("Late Team", ["late1@t.dev", "late2@t.dev"]))).toMatchObject({ ok: false, code: "registration_closed" });
    await pool.query("update registration_forms set status = 'published', closes_at = now() - interval '1 minute'");
    expect(await register(pool, payload("Late Team", ["late1@t.dev", "late2@t.dev"]))).toMatchObject({ ok: false, code: "registration_closed" });
    await pool.query("update registration_forms set closes_at = null");
  });

  it("records rejected submissions for admins without blocking a corrected retry", async () => {
    const bad = await register(pool, payload("Code Ninjas", ["fix1@t.dev", "fix2@t.dev"]), "fix-key-0001");
    expect(bad.ok).toBe(false);
    const good = await register(pool, payload("Code Ninjas Two", ["fix1@t.dev", "fix2@t.dev"]), "fix-key-0001");
    expect(good.ok).toBe(true);
    const { rows } = await pool.query("select count(*)::int as n from registration_submissions where status = 'rejected' and errors->>'code' = 'duplicate_team_name'");
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("marks generated PDFs outdated when card data changes", async () => {
    const r = await register(pool, payload("Pdf Watchers", ["pw1@t.dev", "pw2@t.dev"]));
    const status = async () => (await pool.query("select pdf_status from teams where id = $1", [r.team_id])).rows[0].pdf_status;
    await pool.query("update teams set pdf_status = 'generated' where id = $1", [r.team_id]);
    await pool.query("update participants set phone = '+91 9' || lpad((abs(hashtext(id::text)) % 1000000000)::text, 9, '0') where team_id = $1", [r.team_id]);
    expect(await status()).toBe("generated"); // phone is not printed on the card
    await pool.query("update participants set full_name = 'Renamed Person' where team_id = $1 and role = 'leader'", [r.team_id]);
    expect(await status()).toBe("outdated");

    await pool.query("update teams set pdf_status = 'generated' where id = $1", [r.team_id]);
    await pool.query("update teams set name = 'Pdf Watchers Renamed' where id = $1", [r.team_id]);
    expect(await status()).toBe("outdated");

    await pool.query("update teams set pdf_status = 'generated' where id = $1", [r.team_id]);
    await pool.query("insert into id_card_templates (hackathon_id, version, is_active, config) select id, 99, false, '{}' from hackathons");
    await pool.query("update id_card_templates set is_active = false where is_active");
    await pool.query("update id_card_templates set is_active = true where version = 99");
    expect(await status()).toBe("outdated");
  });
});
