import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("owner's monthly report (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  const u: Record<string, string> = {};
  const report = (who: string) => as(pool, who, async (c) => (await c.query(
    "select * from platform_monthly_report('2026-01-01', '2026-12-01')")).rows);

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    const r = await register(pool, payload("Report Makers", ["r1@rep.dev", "r2@rep.dev"]));
    // Registered in March (India time), fee verified in May.
    await pool.query("update teams set created_at = '2026-03-10T10:00:00Z', payment_status = 'verified', payment_amount = 400, payment_verified_at = '2026-05-02T10:00:00Z' where id = $1", [r.team_id]);
    await pool.query("update participants set created_at = '2026-03-10T10:00:00Z' where team_id = $1", [r.team_id]);
    // 31 Mar 20:00 UTC is already 1 Apr in India.
    const r2 = await register(pool, payload("Late Night", ["l1@rep.dev", "l2@rep.dev"]));
    await pool.query("update teams set created_at = '2026-03-31T20:00:00Z' where id = $1", [r2.team_id]);
    await pool.query("update participants set created_at = '2026-03-31T20:00:00Z' where team_id = $1", [r2.team_id]);
    u.superAdmin = await createUser(pool, "super_admin");
    u.admin = await createUser(pool, "admin");
  });
  afterAll(async () => db?.drop());

  it("only the Super Admin can run it", async () => {
    expect(await pgErrorCode(report(u.admin))).toBe("42501");
    expect(await pgErrorCode(as(pool, null, (c) => c.query("select * from platform_monthly_report('2026-01-01', '2026-12-01')")))).toBe("42501");
  });

  it("counts activity per hackathon in the month it happened (India time)", async () => {
    const rows = await report(u.superAdmin);
    const byMonth = Object.fromEntries(rows.map((r) => [String(r.month instanceof Date ? r.month.toISOString() : r.month).slice(0, 7), r]));
    expect(Number(byMonth["2026-03"].teams)).toBe(1);
    expect(Number(byMonth["2026-03"].participants)).toBe(2);
    expect(Number(byMonth["2026-04"].teams)).toBe(1); // the late-night team
    expect(Number(byMonth["2026-05"].fees_verified)).toBe(400);
    expect(Number(byMonth["2026-03"].fees_verified)).toBe(0);
  });

  it("refuses ranges longer than two years", async () => {
    expect(await pgErrorCode(as(pool, u.superAdmin, (c) => c.query("select * from platform_monthly_report('2020-01-01', '2026-01-01')")))).toBe("23514");
  });
});
