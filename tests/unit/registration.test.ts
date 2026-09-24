import { describe, expect, it } from "vitest";
import { buildRegistrationSchema, flattenIssues, registrationDraftFromFormData, resolveFieldConfig } from "@/lib/domain/registration";

const form = {
  min_team_size: 2,
  max_team_size: 3,
  field_config: { phone: { enabled: true, required: true }, department: { enabled: true, required: false }, academic_year: { enabled: false, required: false } },
  custom_questions: [
    { id: "track", label: "Track", type: "select", options: ["Climate", "Health"], required: true },
    { id: "idea", label: "Idea", type: "textarea", required: false },
  ],
};

const member = (i: number, role: "leader" | "member" = "member") => ({
  full_name: `Person ${String.fromCharCode(65 + i)}`, email: `p${i}@example.edu`, phone: "+91 98000 0000" + i, department: "CS", academic_year: "", college: "", role,
});

const valid = () => ({ team_name: "  Code   Ninjas ", college: "RIT", members: [member(0, "leader"), member(1)], answers: { track: "Climate", idea: "" } });

describe("registration schema", () => {
  const schema = buildRegistrationSchema(form);

  it("accepts a valid registration and cleans the team name", () => {
    const r = schema.safeParse(valid());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.team_name).toBe("Code Ninjas");
  });

  it("enforces team-size limits", () => {
    const tooFew = { ...valid(), members: [member(0, "leader")] };
    const tooMany = { ...valid(), members: [member(0, "leader"), member(1), member(2), member(3)] };
    expect(flattenIssues(schema.safeParse(tooFew).error!)).toHaveProperty("members");
    expect(flattenIssues(schema.safeParse(tooMany).error!)).toHaveProperty("members");
  });

  it("requires exactly one leader", () => {
    const none = { ...valid(), members: [member(0), member(1)] };
    const two = { ...valid(), members: [member(0, "leader"), member(1, "leader")] };
    expect(schema.safeParse(none).success).toBe(false);
    expect(schema.safeParse(two).success).toBe(false);
  });

  it("validates email and phone formats and flags duplicate emails", () => {
    const bad = valid();
    bad.members[0].email = "not-an-email";
    bad.members[1].phone = "abc";
    const errors = flattenIssues(schema.safeParse(bad).error!);
    expect(errors["members.0.email"]).toMatch(/valid email/);
    expect(errors["members.1.phone"]).toMatch(/phone/i);

    const dup = valid();
    dup.members[1].email = "P0@Example.edu";
    expect(flattenIssues(schema.safeParse(dup).error!)["members.1.email"]).toMatch(/Same email/);
  });

  it("respects required/optional field configuration", () => {
    const noPhone = valid();
    noPhone.members[0].phone = "";
    expect(flattenIssues(schema.safeParse(noPhone).error!)["members.0.phone"]).toMatch(/required/);
    const noDept = valid();
    noDept.members[0].department = "";
    expect(schema.safeParse(noDept).success).toBe(true);
  });

  it("validates custom questions", () => {
    const missing = { ...valid(), answers: { track: "" } };
    expect(flattenIssues(schema.safeParse(missing).error!)["answers.track"]).toBeDefined();
    const wrongOption = { ...valid(), answers: { track: "Space" } };
    expect(schema.safeParse(wrongOption).success).toBe(false);
  });

  it("rejects invalid team names", () => {
    expect(schema.safeParse({ ...valid(), team_name: "a" }).success).toBe(false);
    expect(schema.safeParse({ ...valid(), team_name: "<script>" }).success).toBe(false);
    expect(schema.safeParse({ ...valid(), team_name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("resolveFieldConfig", () => {
  it("never marks a disabled field as required", () => {
    expect(resolveFieldConfig({ phone: { enabled: false, required: true } }).phone).toEqual({ enabled: false, required: false });
  });
  it("falls back to defaults for junk", () => {
    expect(resolveFieldConfig("junk").department.enabled).toBe(true);
  });
});

describe("registrationDraftFromFormData", () => {
  it("parses indexed member fields and the chosen leader", () => {
    const fd = new FormData();
    fd.set("team_name", "T");
    fd.set("college", "C");
    fd.set("member_count", "2");
    fd.set("leader_index", "1");
    fd.set("members.0.full_name", "A");
    fd.set("members.1.full_name", "B");
    fd.set("answers.track", "Health");
    const d = registrationDraftFromFormData(fd);
    expect(d.members.map((m) => m.role)).toEqual(["member", "leader"]);
    expect(d.members[1].full_name).toBe("B");
    expect(d.answers).toEqual({ track: "Health" });
  });
  it("caps the member count", () => {
    const fd = new FormData();
    fd.set("member_count", "100000");
    expect(registrationDraftFromFormData(fd).members.length).toBe(20);
  });
});
