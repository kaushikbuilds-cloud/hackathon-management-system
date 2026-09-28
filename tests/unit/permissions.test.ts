import { describe, expect, it } from "vitest";
import { canGrant, sanitizeGrants } from "@/lib/permissions";

const admin = (perms: string[]) => ({ isSuperAdmin: false, permissions: new Set(perms) });

describe("granting permissions", () => {
  it("staff hand out only what they hold; the Super Admin anything", () => {
    expect(canGrant("manage_food", admin(["manage_food"]))).toBe(true);
    expect(canGrant("manage_food", admin(["record_attendance"]))).toBe(false);
    expect(canGrant("manage_food", { isSuperAdmin: true, permissions: new Set() })).toBe(true);
  });

  it("whoever runs judging may appoint judges without being a judge", () => {
    expect(canGrant("judge_teams", admin(["manage_judging"]))).toBe(true);
    expect(canGrant("judge_teams", admin(["manage_event"]))).toBe(false);
    expect(sanitizeGrants(["judge_teams", "manage_judging", "manage_food"], "official", admin(["manage_judging"]))).toEqual(["judge_teams"]);
  });
});
