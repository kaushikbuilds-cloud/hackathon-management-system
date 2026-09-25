import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { as, createTestDatabase, createUser, payload, pgErrorCode, register } from "./helpers";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("authorization & RLS (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let pool: pg.Pool;
  const ids: Record<string, string> = {};
  let teamA: string;
  let teamB: string;
  let leaderA: string;
  let memberA: string;
  let leaderB: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    pool = db.pool;
    const a = await register(pool, payload("Team Apple", ["apple1@t.dev", "apple2@t.dev"]));
    const b = await register(pool, payload("Team Banana", ["banana1@t.dev", "banana2@t.dev"]));
    teamA = a.team_id!;
    teamB = b.team_id!;
    const q = async (email: string) => (await pool.query("select id from participants where email = $1", [email])).rows[0].id as string;
    leaderA = await q("apple1@t.dev");
    memberA = await q("apple2@t.dev");
    leaderB = await q("banana1@t.dev");
    ids.superAdmin = await createUser(pool, "super_admin");
    ids.admin = await createUser(pool, "admin");
    ids.official = await createUser(pool, "official", {}, ["manual_checkin"]);
    ids.officialPdf = await createUser(pool, "official", {}, ["manual_checkin", "generate_pdf", "edit_registrations", "correct_attendance"]);
    ids.leaderA = await createUser(pool, "participant", { participant_id: leaderA });
    ids.memberA = await createUser(pool, "participant", { participant_id: memberA });
    ids.leaderB = await createUser(pool, "participant", { participant_id: leaderB });
  });
  afterAll(async () => db?.drop());

  describe("anonymous", () => {
    it("can read public event info but no teams or participants", async () => {
      await as(pool, null, async (c) => {
        expect((await c.query("select name from hackathons")).rowCount).toBe(1);
        expect((await c.query("select slug from registration_forms")).rowCount).toBe(1);
      });
      expect(await pgErrorCode(as(pool, null, (c) => c.query("select * from teams")))).toBe("42501");
      expect(await pgErrorCode(as(pool, null, (c) => c.query("select * from participants")))).toBe("42501");
      expect(await pgErrorCode(as(pool, null, (c) => c.query("select * from audit_logs")))).toBe("42501");
    });
    it("cannot call register_team directly (service role only)", async () => {
      expect(await pgErrorCode(as(pool, null, (c) => c.query("select register_team('buildfest-2026', '{}'::jsonb, null)")))).toBe("42501");
    });
  });

  describe("team member / leader", () => {
    it("members see only their own team, own record, and a contact-free roster", async () => {
      await as(pool, ids.memberA, async (c) => {
        const teams = await c.query("select id from teams");
        expect(teams.rows.map((r) => r.id)).toEqual([teamA]);
        const people = await c.query("select id from participants");
        expect(people.rows.map((r) => r.id)).toEqual([memberA]); // not the leader's private row
        const roster = await c.query("select * from my_team_roster()");
        expect(roster.rowCount).toBe(2);
        expect(Object.keys(roster.rows[0])).not.toContain("email");
        expect((await c.query("select * from participants where team_id = $1", [teamB])).rowCount).toBe(0);
      });
    });
    it("the Team Leader sees every member of their own team only", async () => {
      await as(pool, ids.leaderA, async (c) => {
        const people = await c.query("select team_id, email from participants");
        expect(people.rowCount).toBe(2);
        expect(people.rows.every((r) => r.team_id === teamA)).toBe(true);
      });
    });
    it("cannot modify registrations, attendance or other profiles", async () => {
      await as(pool, ids.leaderA, async (c) => {
        const upd = await c.query("update teams set name = 'Hacked' where id = $1", [teamA]);
        expect(upd.rowCount).toBe(0);
      });
      expect(await pgErrorCode(as(pool, ids.leaderA, (c) => c.query("select check_in($1, 'manual')", [leaderA])))).toBe("42501");
      expect(await pgErrorCode(as(pool, ids.leaderA, (c) => c.query("update profiles set role = 'admin' where id = $1", [ids.leaderA])))).toBe("42501");
      expect(await pgErrorCode(as(pool, ids.leaderA, (c) => c.query("insert into audit_logs(action) values ('forged')")))).toBe("42501");
    });
    it("cannot read audit logs, credentials or submissions", async () => {
      await as(pool, ids.leaderA, async (c) => {
        expect((await c.query("select * from audit_logs")).rowCount).toBe(0);
        expect((await c.query("select * from credential_events")).rowCount).toBe(0);
        expect((await c.query("select * from registration_submissions")).rowCount).toBe(0);
      });
    });
    it("can change their own display name only", async () => {
      await as(pool, ids.leaderA, async (c) => {
        expect((await c.query("update profiles set full_name = 'New Name' where id = $1", [ids.leaderA])).rowCount).toBe(1);
        expect((await c.query("update profiles set full_name = 'X' where id = $1", [ids.leaderB])).rowCount).toBe(0);
      });
    });
  });

  describe("official", () => {
    it("can view all teams but not edit without permission", async () => {
      await as(pool, ids.official, async (c) => {
        expect((await c.query("select * from teams")).rowCount).toBeGreaterThanOrEqual(2);
        expect((await c.query("update teams set college = 'X' where id = $1", [teamA])).rowCount).toBe(0);
      });
    });
    it("can edit when granted edit_registrations", async () => {
      await as(pool, ids.officialPdf, async (c) => {
        expect((await c.query("update teams set college = 'Edited College' where id = $1", [teamA])).rowCount).toBe(1);
      }, { rollback: true });
    });
    it("cannot manage events, forms, templates or other accounts", async () => {
      await as(pool, ids.official, async (c) => {
        expect((await c.query("update hackathons set name = 'Nope'")).rowCount).toBe(0);
        expect((await c.query("update registration_forms set status = 'closed'")).rowCount).toBe(0);
      });
      expect(await pgErrorCode(as(pool, ids.official, (c) => c.query("select publish_id_card_template('x', '{}')")))).toBe("42501");
      expect(await pgErrorCode(as(pool, ids.official, (c) => c.query("update profiles set role = 'admin' where id = $1", [ids.official])))).toBe("42501");
    });
  });

  describe("admin & super admin", () => {
    it("admin can manage the event and registrations", async () => {
      await as(pool, ids.admin, async (c) => {
        expect((await c.query("update hackathons set venue = 'Main Hall'")).rowCount).toBe(1);
        expect((await c.query("update teams set status = 'flagged', status_reason = 'check' where id = $1", [teamB])).rowCount).toBe(1);
        expect((await c.query("select * from audit_logs")).rowCount).toBeGreaterThan(0);
      }, { rollback: true });
    });
    it("roles cannot be changed through the client API by anyone (server-side only)", async () => {
      for (const who of [ids.admin, ids.superAdmin, ids.official]) {
        expect(await pgErrorCode(as(pool, who, (c) => c.query("update profiles set role = 'super_admin' where id = $1", [who])))).toBe("42501");
      }
    });
    it("the profile guard blocks admins from escalating even if column grants were widened", async () => {
      await pool.query("grant update (role) on public.profiles to authenticated");
      try {
        // Self-escalation is stopped by the profiles_guard trigger…
        expect(await pgErrorCode(as(pool, ids.admin, (c) => c.query("update profiles set role = 'super_admin' where id = $1", [ids.admin])))).toBe("42501");
        expect(await pgErrorCode(as(pool, ids.leaderA, (c) => c.query("update profiles set role = 'admin' where id = $1", [ids.leaderA])))).toBe("42501");
        expect(await pgErrorCode(as(pool, ids.official, (c) => c.query("update profiles set role = 'admin' where id = $1", [ids.official])))).toBe("42501");
        // …and other users' rows are not updatable through RLS at all.
        await as(pool, ids.admin, async (c) => {
          expect((await c.query("update profiles set role = 'admin' where id = $1", [ids.official])).rowCount).toBe(0);
        });
      } finally {
        await pool.query("revoke update (role) on public.profiles from authenticated");
      }
    });
    it("deactivated staff lose access immediately", async () => {
      await pool.query("update profiles set is_active = false where id = $1", [ids.official]);
      await as(pool, ids.official, async (c) => {
        expect((await c.query("select * from teams")).rowCount).toBe(0);
      });
      await pool.query("update profiles set is_active = true where id = $1", [ids.official]);
    });
  });

  describe("account provisioning", () => {
    it("syncs role and team link when Supabase Auth writes app_metadata after insert", async () => {
      const { randomUUID } = await import("node:crypto");
      const id = randomUUID();
      // GoTrue: insert with provider metadata only, then UPDATE with custom app_metadata.
      await pool.query("insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, 'late@t.dev', '{\"provider\":\"email\"}', '{\"full_name\":\"Late Binder\"}')", [id]);
      expect((await pool.query("select role from profiles where id = $1", [id])).rows[0].role).toBe("participant");
      const participant = (await pool.query("select id from participants where email = 'banana2@t.dev'")).rows[0].id;
      await pool.query(
        "update auth.users set raw_app_meta_data = raw_app_meta_data || $2::jsonb where id = $1",
        [id, JSON.stringify({ role: "participant", participant_id: participant, must_change_password: true, temp_password_expires_at: "2099-01-01T00:00:00Z" })],
      );
      const { rows } = await pool.query("select role, participant_id, must_change_password, full_name from profiles where id = $1", [id]);
      expect(rows[0]).toMatchObject({ role: "participant", participant_id: participant, must_change_password: true, full_name: "Late Binder" });
      expect((await pool.query("select user_id from participants where id = $1", [participant])).rows[0].user_id).toBe(id);

      const staffId = randomUUID();
      await pool.query("insert into auth.users (id, email, raw_app_meta_data) values ($1, 'late-official@t.dev', '{\"provider\":\"email\"}')", [staffId]);
      await pool.query("update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"role\":\"official\"}' where id = $1", [staffId]);
      expect((await pool.query("select role from profiles where id = $1", [staffId])).rows[0].role).toBe("official");
      expect((await pool.query("select count(*)::int as n from official_permissions where profile_id = $1", [staffId])).rows[0].n).toBe(1);
    });
  });

  describe("audit trail", () => {
    it("attributes changes to the acting user", async () => {
      await as(pool, ids.admin, (c) => c.query("update teams set college = 'Audited College' where id = $1", [teamB]));
      const { rows } = await pool.query("select actor_id, actor_role, details from audit_logs where action = 'teams.update' and entity_id = $1 order by id desc limit 1", [teamB]);
      expect(rows[0].actor_id).toBe(ids.admin);
      expect(rows[0].actor_role).toBe("admin");
      expect(rows[0].details.college.to).toBe("Audited College");
    });
    it("never copies QR tokens into the audit log", async () => {
      const { rows } = await pool.query("select count(*)::int as n from audit_logs where details::text ~ '[0-9a-f]{64}'");
      expect(rows[0].n).toBe(0);
    });
  });

  describe("attendance", () => {
    it("prevents duplicate check-ins and records the official", async () => {
      const first = await as(pool, ids.official, async (c) => (await c.query("select check_in($1, 'manual') as r", [leaderB])).rows[0].r);
      expect(first.ok).toBe(true);
      const again = await as(pool, ids.official, async (c) => (await c.query("select check_in($1, 'manual') as r", [leaderB])).rows[0].r);
      expect(again).toMatchObject({ ok: false, code: "already_checked_in" });
      const { rows } = await pool.query("select recorded_by from attendance where participant_id = $1", [leaderB]);
      expect(rows).toEqual([{ recorded_by: ids.official }]);
    });

    it("allows only one of many concurrent check-ins", async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => as(pool, ids.official, async (c) => (await c.query("select check_in($1, 'qr') as r", [memberA])).rows[0].r)),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const { rows } = await pool.query("select count(*)::int as n from attendance where participant_id = $1 and status = 'present'", [memberA]);
      expect(rows[0].n).toBe(1);
    });

    it("reports QR states: valid, already checked in, revoked, invalid", async () => {
      const token = async (pid: string) => (await pool.query("select qr_token from participants where id = $1", [pid])).rows[0].qr_token as string;
      const verify = (t: string) => as(pool, ids.official, async (c) => (await c.query("select verify_qr($1) as r", [t])).rows[0].r);
      expect((await verify(await token(leaderA))).state).toBe("valid");
      expect((await verify(await token(memberA))).state).toBe("already_checked_in");
      expect((await verify("f".repeat(64))).state).toBe("invalid");
      expect((await verify("PRT-2026-0001")).state).toBe("invalid");
      await pool.query("update participants set qr_revoked_at = now() where id = $1", [leaderA]);
      expect((await verify(await token(leaderA))).state).toBe("revoked");
      const rejected = await as(pool, ids.official, async (c) => (await c.query("select check_in($1, 'qr') as r", [leaderA])).rows[0].r);
      expect(rejected.code).toBe("revoked");
      await pool.query("update participants set qr_revoked_at = null where id = $1", [leaderA]);
    });

    it("scanning does not record attendance by itself", async () => {
      const before = (await pool.query("select count(*)::int as n from attendance")).rows[0].n;
      const t = (await pool.query("select qr_token from participants where id = $1", [leaderA])).rows[0].qr_token;
      await as(pool, ids.official, (c) => c.query("select verify_qr($1)", [t]));
      expect((await pool.query("select count(*)::int as n from attendance")).rows[0].n).toBe(before);
    });

    it("requires permission and a reason to undo, then allows re-check-in", async () => {
      const attId = (await pool.query("select id from attendance where participant_id = $1 and status = 'present'", [leaderB])).rows[0].id;
      expect(await pgErrorCode(as(pool, ids.official, (c) => c.query("select undo_check_in($1, 'mistake')", [attId])))).toBe("42501");
      const noReason = await as(pool, ids.officialPdf, async (c) => (await c.query("select undo_check_in($1, '') as r", [attId])).rows[0].r);
      expect(noReason.code).toBe("reason_required");
      const ok = await as(pool, ids.officialPdf, async (c) => (await c.query("select undo_check_in($1, 'Scanned wrong card') as r", [attId])).rows[0].r);
      expect(ok.ok).toBe(true);
      const again = await as(pool, ids.official, async (c) => (await c.query("select check_in($1, 'manual') as r", [leaderB])).rows[0].r);
      expect(again.ok).toBe(true);
      const hist = await pool.query("select status, correction_reason from attendance where participant_id = $1 order by checked_in_at", [leaderB]);
      expect(hist.rows).toEqual([{ status: "corrected", correction_reason: "Scanned wrong card" }, { status: "present", correction_reason: null }]);
    });

    it("team members can see their own team's attendance only", async () => {
      await as(pool, ids.leaderA, async (c) => {
        const { rows } = await c.query("select team_id from attendance");
        expect(rows.every((r) => r.team_id === teamA)).toBe(true);
      });
    });
  });

  describe("support requests", () => {
    let requestId: string;

    it("team members create requests for their own team only", async () => {
      requestId = await as(pool, ids.leaderA, async (c) => {
        const { rows } = await c.query(
          "insert into support_requests (team_id, category, subject, description) values ($1, 'technical', 'Wi-Fi is down', 'Cannot connect at table 12') returning id, team_id, status",
          [teamB],
        );
        expect(rows[0].team_id).toBe(teamA); // forced to the caller's team
        expect(rows[0].status).toBe("new");
        return rows[0].id as string;
      });
      await as(pool, ids.leaderB, async (c) => {
        expect((await c.query("select * from support_requests where id = $1", [requestId])).rowCount).toBe(0);
      });
    });

    it("officials only see requests assigned to them unless granted", async () => {
      await as(pool, ids.official, async (c) => {
        expect((await c.query("select * from support_requests")).rowCount).toBe(0);
      });
      await as(pool, ids.admin, (c) => c.query("update support_requests set assigned_to = $1 where id = $2", [ids.official, requestId]));
      await as(pool, ids.official, async (c) => {
        const { rows } = await c.query("select status from support_requests where id = $1", [requestId]);
        expect(rows[0].status).toBe("assigned");
      });
      const n = await pool.query("select count(*)::int as n from notifications where profile_id = $1", [ids.official]);
      expect(n.rows[0].n).toBe(1);
    });

    it("enforces status transitions and notifies the team", async () => {
      expect(await pgErrorCode(as(pool, ids.official, (c) => c.query("update support_requests set status = 'new' where id = $1", [requestId])))).toBe("23514");
      await as(pool, ids.official, (c) => c.query("update support_requests set status = 'in_progress' where id = $1", [requestId]));
      await as(pool, ids.official, (c) => c.query("update support_requests set status = 'resolved' where id = $1", [requestId]));
      await as(pool, ids.leaderA, async (c) => {
        const { rows } = await c.query("select title from notifications");
        expect(rows.filter((r) => r.title === "Support request updated").length).toBeGreaterThanOrEqual(2);
      });
      const hist = await pool.query("select to_status from support_status_history where request_id = $1 order by created_at", [requestId]);
      expect(hist.rows.map((r) => r.to_status)).toEqual(["new", "assigned", "in_progress", "resolved"]);
    });

    it("officials cannot reassign requests; team members cannot change status", async () => {
      expect(await pgErrorCode(as(pool, ids.official, (c) => c.query("update support_requests set assigned_to = $1 where id = $2", [ids.officialPdf, requestId])))).toBe("42501");
      await as(pool, ids.leaderA, async (c) => {
        expect((await c.query("update support_requests set status = 'closed' where id = $1", [requestId])).rowCount).toBe(0);
      });
    });

    it("hides internal staff notes from the team", async () => {
      await as(pool, ids.official, (c) => c.query("insert into support_messages (request_id, body, is_internal) values ($1, 'Router rebooted', false), ($1, 'Staff-only note', true)", [requestId]));
      await as(pool, ids.leaderA, async (c) => {
        const { rows } = await c.query("select body from support_messages where request_id = $1", [requestId]);
        expect(rows.map((r) => r.body)).toEqual(["Router rebooted"]);
        // A participant cannot post an internal note (flag is forced off).
        await c.query("insert into support_messages (request_id, body, is_internal) values ($1, 'Thanks!', true)", [requestId]);
        const mine = await c.query("select is_internal from support_messages where body = 'Thanks!'");
        expect(mine.rows[0].is_internal).toBe(false);
      });
    });
  });

  describe("rate limiting", () => {
    it("blocks after the limit within a window", async () => {
      const hits = [];
      for (let i = 0; i < 4; i++) hits.push((await pool.query("select check_rate_limit('test:ip', 3, 60) as ok")).rows[0].ok);
      expect(hits).toEqual([true, true, true, false]);
      expect(await pgErrorCode(as(pool, ids.leaderA, (c) => c.query("select check_rate_limit('x', 1, 1)")))).toBe("42501");
    });
  });
});
