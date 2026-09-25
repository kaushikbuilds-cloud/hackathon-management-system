import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

type OrderResult = { ok: boolean; code?: string; message?: string; order_id?: string; order_no?: number; total?: string };

describe.skipIf(!enabled)("food ordering (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  let hA: string;
  let freeShop: string;
  let paidShop: string;
  let lunch: string;
  let chai: string;
  let samosa: string;
  const u: Record<string, string> = {};

  const order = (userId: string, shop: string, items: { item_id: string; qty: number }[], note: string | null = null) =>
    as(pool, userId, async (c) => (await c.query("select place_food_order($1, $2, $3) as r", [shop, JSON.stringify(items), note])).rows[0].r as OrderResult);

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    hA = (await pool.query("select id from hackathons")).rows[0].id;
    await register(pool, payload("Hungry Coders", ["f1@food.dev", "f2@food.dev"]));
    const [p1, p2] = (await pool.query("select id from participants where email in ('f1@food.dev', 'f2@food.dev') order by email")).rows.map((r) => r.id);
    u.p1 = await createUser(pool, "participant", { participant_id: p1 });
    u.p2 = await createUser(pool, "participant", { participant_id: p2 });
    await register(pool, payload("Other Eaters", ["o1@food.dev", "o2@food.dev"]));
    const o1 = (await pool.query("select id from participants where email = 'o1@food.dev'")).rows[0].id;
    u.other = await createUser(pool, "participant", { participant_id: o1 });
    // The shared team login of "Hungry Coders".
    u.team = await createUser(pool, "participant");
    await pool.query("update profiles set team_id = (select team_id from participants where id = $1) where id = $2", [p1, u.team]);
    u.admin = await createUser(pool, "admin");
    u.counter = await createUser(pool, "official", {}, ["manage_food"]);
    u.gate = await createUser(pool, "official");

    await as(pool, u.admin, async (c) => {
      freeShop = (await c.query("insert into food_shops (hackathon_id, name, is_free, is_open) values ($1, 'Main Hall Meals', true, true) returning id", [hA])).rows[0].id;
      paidShop = (await c.query("insert into food_shops (hackathon_id, name, is_open) values ($1, 'Snack Stall', true) returning id", [hA])).rows[0].id;
      lunch = (await c.query("insert into food_items (hackathon_id, shop_id, name, price, limit_per_person) values ($1, $2, 'Lunch', 50, 1) returning id", [hA, freeShop])).rows[0].id;
      chai = (await c.query("insert into food_items (hackathon_id, shop_id, name, price) values ($1, $2, 'Chai', 15) returning id", [hA, paidShop])).rows[0].id;
      samosa = (await c.query("insert into food_items (hackathon_id, shop_id, name, price, is_available) values ($1, $2, 'Samosa', 20, false) returning id", [hA, paidShop])).rows[0].id;
    });
  });
  afterAll(async () => db?.drop());

  it("gives admins the food permission by default, and officials only when granted", async () => {
    const has = (id: string) => as(pool, id, async (c) => (await c.query("select has_permission('manage_food') as ok")).rows[0].ok as boolean);
    expect(await has(u.admin)).toBe(true);
    expect(await has(u.counter)).toBe(true);
    expect(await has(u.gate)).toBe(false);
  });

  it("free shops charge nothing and enforce the per-person limit", async () => {
    const first = await order(u.p1, freeShop, [{ item_id: lunch, qty: 1 }]);
    expect(first).toMatchObject({ ok: true });
    expect(Number(first.total)).toBe(0);
    const second = await order(u.p1, freeShop, [{ item_id: lunch, qty: 1 }]);
    expect(second).toMatchObject({ ok: false, code: "limit_reached" });
    // Duplicate lines are added together before the limit check.
    expect(await order(u.p2, freeShop, [{ item_id: lunch, qty: 1 }, { item_id: lunch, qty: 1 }])).toMatchObject({ ok: false, code: "limit_reached" });
  });

  it("paid shops total the order from the database price, not the client", async () => {
    const r = await order(u.p2, paidShop, [{ item_id: chai, qty: 3 }], "less sugar");
    expect(r.ok).toBe(true);
    expect(Number(r.total)).toBe(45);
    const { rows } = await pool.query("select name, price, qty from food_order_items where order_id = $1", [r.order_id]);
    expect(rows).toEqual([{ name: "Chai", price: "15.00", qty: 3 }]);
  });

  it("refuses unavailable items, closed shops, items from another shop and bad quantities", async () => {
    expect(await order(u.p2, paidShop, [{ item_id: samosa, qty: 1 }])).toMatchObject({ ok: false, code: "item_unavailable" });
    expect(await order(u.p2, paidShop, [{ item_id: lunch, qty: 1 }])).toMatchObject({ ok: false, code: "item_unavailable" });
    expect(await order(u.p2, paidShop, [{ item_id: chai, qty: 21 }])).toMatchObject({ ok: false, code: "bad_qty" });
    expect(await order(u.p2, paidShop, [])).toMatchObject({ ok: false, code: "empty" });
    await pool.query("update food_shops set is_open = false where id = $1", [paidShop]);
    expect(await order(u.p2, paidShop, [{ item_id: chai, qty: 1 }])).toMatchObject({ ok: false, code: "shop_closed" });
    await pool.query("update food_shops set is_open = true where id = $1", [paidShop]);
  });

  it("staff cannot place orders; participants cannot edit menus or orders directly", async () => {
    expect(await order(u.admin, paidShop, [{ item_id: chai, qty: 1 }])).toMatchObject({ ok: false, code: "not_authorized" });
    await as(pool, u.p1, async (c) => {
      expect((await c.query("update food_items set price = 0 where id = $1", [chai])).rowCount).toBe(0);
      expect((await c.query("update food_shops set is_open = false")).rowCount).toBe(0);
    });
    expect(await pgErrorCode(as(pool, u.p1, (c) => c.query("update food_orders set status = 'collected'")))).toBe("42501");
    expect(await pgErrorCode(as(pool, u.p1, (c) => c.query(
      "insert into food_shops (hackathon_id, name) values ($1, 'Fake')", [hA])))).toBe("42501");
  });

  it("a team sees its own members' orders only; counter staff see all of them", async () => {
    const teamOf = async (userId: string) => (await as(pool, userId, async (c) => (await c.query("select my_team_id() as t")).rows[0].t)) as string;
    const team = await teamOf(u.p1);
    expect(await teamOf(u.team)).toBe(team);
    for (const who of [u.p1, u.p2, u.team]) {
      const rows = await as(pool, who, async (c) => (await c.query("select p.team_id from food_orders o join participants p on p.id = o.participant_id")).rows);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.team_id === team)).toBe(true);
    }
    expect(await as(pool, u.other, async (c) => (await c.query("select 1 from food_orders")).rowCount)).toBe(0);
    const all = await as(pool, u.counter, async (c) => (await c.query("select 1 from food_orders")).rowCount);
    expect(all).toBe((await pool.query("select 1 from food_orders")).rowCount);
    expect(await as(pool, u.gate, async (c) => (await c.query("select 1 from food_orders")).rowCount)).toBe(0);
  });

  it("the team login orders for a chosen member, and limits stay per person", async () => {
    const order4 = (member: string | null, items: { item_id: string; qty: number }[]) =>
      as(pool, u.team, async (c) => (await c.query("select place_food_order($1, $2, null, $3) as r", [items[0].item_id === lunch ? freeShop : paidShop, JSON.stringify(items), member])).rows[0].r as OrderResult);
    const [p1, p2] = (await pool.query("select id from participants where email in ('f1@food.dev', 'f2@food.dev') order by email")).rows.map((r) => r.id);
    const o1 = (await pool.query("select id from participants where email = 'o1@food.dev'")).rows[0].id;
    expect(await order4(null, [{ item_id: chai, qty: 1 }])).toMatchObject({ ok: false, code: "choose_member" });
    expect(await order4(o1, [{ item_id: chai, qty: 1 }])).toMatchObject({ ok: false, code: "choose_member" });
    expect(await order4(p1, [{ item_id: lunch, qty: 1 }])).toMatchObject({ ok: false, code: "limit_reached" }); // p1 had lunch
    const extra = await pool.query("select count(*) from food_orders where participant_id = $1", [p2]);
    expect(Number(extra.rows[0].count)).toBeGreaterThan(0);
    // A member of another team cannot order for this team either.
    expect(await as(pool, u.other, async (c) => (await c.query("select place_food_order($1, $2, null, $3) as r",
      [paidShop, JSON.stringify([{ item_id: chai, qty: 1 }]), p1])).rows[0].r)).toMatchObject({ ok: false, code: "choose_member" });
  });

  it("moves orders through the counter workflow; only the same team can cancel, and only new orders", async () => {
    const r = await order(u.p2, paidShop, [{ item_id: chai, qty: 1 }]);
    const set = (id: string, s: string) => as(pool, id, async (c) => (await c.query("select set_food_order_status($1, $2) as ok", [r.order_id, s])).rows[0].ok as boolean);
    expect(await pgErrorCode(set(u.gate, "preparing"))).toBe("42501");
    expect(await set(u.counter, "collected")).toBe(false); // must be ready first
    expect(await set(u.counter, "preparing")).toBe(true);
    const cancel = (who: string, id: string) => as(pool, who, async (c) => (await c.query("select cancel_food_order($1) as ok", [id])).rows[0].ok as boolean);
    expect(await cancel(u.p2, r.order_id!)).toBe(false); // already being prepared
    expect(await set(u.counter, "ready")).toBe(true);
    expect(await set(u.counter, "collected")).toBe(true);
    expect(await set(u.counter, "cancelled")).toBe(false);
    const other = await order(u.p2, paidShop, [{ item_id: chai, qty: 1 }]);
    expect(await cancel(u.other, other.order_id!)).toBe(false);
    expect(await cancel(u.team, other.order_id!)).toBe(true);
  });

  it("limits open orders to three and numbers orders per hackathon", async () => {
    const p1 = (await pool.query("select participant_id from profiles where id = $1", [u.p1])).rows[0].participant_id;
    const open = async () => Number((await pool.query(
      "select count(*) from food_orders where participant_id = $1 and status in ('placed', 'preparing', 'ready')", [p1])).rows[0].count);
    while ((await open()) < 3) expect((await order(u.p1, paidShop, [{ item_id: chai, qty: 1 }])).ok).toBe(true);
    expect(await order(u.p1, paidShop, [{ item_id: chai, qty: 1 }])).toMatchObject({ ok: false, code: "too_many_open" });
    expect(await open()).toBe(3);
    const { rows } = await pool.query("select order_no from food_orders where hackathon_id = $1 order by order_no", [hA]);
    expect(rows.map((x) => x.order_no)).toEqual(rows.map((_, i) => i + 1));
  });

  it("keeps each hackathon's shops private", async () => {
    const hB = (await pool.query("insert into hackathons (name) values ('Other Food Hack') returning id")).rows[0].id;
    const adminB = await createUser(pool, "admin");
    await pool.query("update profiles set hackathon_id = $1 where id = $2", [hB, adminB]);
    await as(pool, adminB, async (c) => {
      expect((await c.query("select 1 from food_shops")).rowCount).toBe(0);
      expect((await c.query("select 1 from food_orders")).rowCount).toBe(0);
      expect((await c.query("update food_items set price = 1")).rowCount).toBe(0);
    });
    expect(await pgErrorCode(as(pool, adminB, (c) => c.query(
      "insert into food_items (hackathon_id, shop_id, name) values ($1, $2, 'Sneaky')", [hB, paidShop])))).toBe("42501");
  });
  it("a shop login sees and handles only its own orders, and a rejection needs a reason", async () => {
    const vendor = await createUser(pool, "vendor");
    await pool.query("update profiles set shop_id = $1 where id = $2", [paidShop, vendor]);
    const other = await createUser(pool, "vendor");
    await pool.query("update profiles set shop_id = $1 where id = $2", [freeShop, other]);
    const { rows: [prof] } = await pool.query("select hackathon_id, role from profiles where id = $1", [vendor]);
    expect(prof).toEqual({ hackathon_id: hA, role: "vendor" });

    const [p2] = (await pool.query("select id from participants where email = 'f2@food.dev'")).rows.map((r) => r.id);
    await pool.query("update food_orders set status = 'cancelled' where participant_id = $1 and status in ('placed', 'preparing', 'ready')", [p2]);
    const r = await order(u.p2, paidShop, [{ item_id: chai, qty: 2 }]);
    const shopOrders = await as(pool, vendor, async (c) => (await c.query("select shop_id from food_orders")).rows);
    expect(shopOrders.length).toBeGreaterThan(0);
    expect(shopOrders.every((o) => o.shop_id === paidShop)).toBe(true);
    // Names are not exposed to shops through participants.
    expect(await as(pool, vendor, async (c) => (await c.query("select 1 from participants")).rowCount)).toBe(0);

    const set = (who: string, status: string, reason: string | null = null) =>
      as(pool, who, async (c) => (await c.query("select set_food_order_status($1, $2, $3) as ok", [r.order_id, status, reason])).rows[0].ok);
    expect(await pgErrorCode(set(other, "preparing"))).toBe("42501"); // another shop's login
    expect(await pgErrorCode(set(vendor, "rejected", ""))).toBe("23514");
    expect(await set(vendor, "rejected", "Sold out")).toBe(true);
    expect((await pool.query("select status, reject_reason from food_orders where id = $1", [r.order_id])).rows[0]).toEqual({ status: "rejected", reject_reason: "Sold out" });
    expect(await set(vendor, "preparing")).toBe(false); // rejected is final

    const r2 = await order(u.p2, paidShop, [{ item_id: chai, qty: 1 }]);
    const set2 = (status: string) => as(pool, vendor, async (c) => (await c.query("select set_food_order_status($1, $2) as ok", [r2.order_id, status])).rows[0].ok);
    expect(await set2("preparing")).toBe(true);
    expect(await set2("ready")).toBe(true);
    expect(await set2("collected")).toBe(true);
  });

  it("a shop login edits only its own menu and opens or closes only its own shop", async () => {
    const vendor = (await pool.query("select id from profiles where shop_id = $1", [paidShop])).rows[0].id;
    await as(pool, vendor, async (c) => {
      expect((await c.query("update food_items set price = 18 where id = $1", [chai])).rowCount).toBe(1);
      expect((await c.query("update food_items set price = 0 where id = $1", [lunch])).rowCount).toBe(0);
      expect((await c.query("update food_shops set is_free = true")).rowCount).toBe(0);
      expect((await c.query("select set_my_shop_open(false) as ok")).rows[0].ok).toBe(true);
    });
    expect(await pgErrorCode(as(pool, vendor, (c) => c.query(
      "insert into food_items (hackathon_id, shop_id, name, price) values ($1, $2, 'Sneaky', 1)", [hA, freeShop])))).toBe("42501");
    const { rows } = await pool.query("select id, is_open from food_shops where id in ($1, $2)", [paidShop, freeShop]);
    expect(Object.fromEntries(rows.map((x) => [x.id, x.is_open]))).toEqual({ [paidShop]: false, [freeShop]: true });
    expect(Number((await pool.query("select price from food_items where id = $1", [chai])).rows[0].price)).toBe(18);
    await pool.query("update food_shops set is_open = true where id = $1", [paidShop]);
  });

  it("gives each shop a Shop ID from the hackathon prefix", async () => {
    const { rows } = await pool.query("select s.code, h.code_prefix from food_shops s join hackathons h on h.id = s.hackathon_id where s.hackathon_id = $1", [hA]);
    for (const r of rows) expect(r.code).toMatch(new RegExp(`^${r.code_prefix}-S\\d{2,}$`));
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });
});
