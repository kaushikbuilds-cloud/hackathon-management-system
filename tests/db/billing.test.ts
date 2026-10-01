import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, pgErrorCode } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("self-serve billing (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let organiser: string;
  let other: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    organiser = await createUser(pool, "admin");
    await pool.query("delete from staff_permissions where profile_id = $1", [organiser]); // a fresh sign-up has none
    other = await createUser(pool, "admin");
    await pool.query(`insert into hackathon_orders (profile_id, email, organiser_name, organisation, hackathon_name, amount_paise, razorpay_order_id)
      values ($1, 'org@billing.dev', 'Olivia', 'Riverside College', 'Paid Hack', 299900, 'order_db1')`, [organiser]);
  });
  afterAll(async () => db?.drop());

  it("has a default price that anyone can read", async () => {
    expect((await as(pool, null, async (c) => (await c.query("select hackathon_price_paise from platform_settings")).rows))[0].hackathon_price_paise).toBe(299900);
  });

  it("only the server can create a paid hackathon", async () => {
    expect(await pgErrorCode(as(pool, organiser, (c) => c.query("select provision_paid_hackathon('order_db1', 'pay_x', '{}'::jsonb)")))).toBe("42501");
  });

  it("creates the hackathon once, makes the organiser its Admin, and stays idempotent", async () => {
    const run = async () => (await pool.query("select provision_paid_hackathon('order_db1', 'pay_db1', '{}'::jsonb) as h")).rows[0].h as string;
    const h1 = await run();
    const h2 = await run();
    expect(h2).toBe(h1);
    const h = (await pool.query("select name, organizer_name, status, contact_email from hackathons where id = $1", [h1])).rows[0];
    expect(h).toEqual({ name: "Paid Hack", organizer_name: "Riverside College", status: "active", contact_email: "org@billing.dev" });
    expect((await pool.query("select hackathon_id from profiles where id = $1", [organiser])).rows[0].hackathon_id).toBe(h1);
    const perms = (await pool.query("select permission from staff_permissions where profile_id = $1", [organiser])).rows.map((r) => r.permission);
    expect(perms).toEqual(expect.arrayContaining(["manage_event", "manage_registrations", "manage_officials"]));
    expect((await pool.query("select status, razorpay_payment_id from hackathon_orders where razorpay_order_id = 'order_db1'")).rows[0]).toEqual({ status: "paid", razorpay_payment_id: "pay_db1" });
    expect((await pool.query("select count(*)::int as n from id_card_templates where hackathon_id = $1", [h1])).rows[0].n).toBe(1);
  });

  it("organisers see only their own orders", async () => {
    expect(await as(pool, organiser, async (c) => (await c.query("select count(*)::int as n from hackathon_orders")).rows[0].n)).toBe(1);
    expect(await as(pool, other, async (c) => (await c.query("select count(*)::int as n from hackathon_orders")).rows[0].n)).toBe(0);
    expect(await pgErrorCode(as(pool, organiser, (c) => c.query("update hackathon_orders set status = 'paid'")))).toBe("42501");
  });
});
