import { describe, expect, it } from "vitest";
import { cleanTeamName, normalizeEmail, normalizeTeamName, teamPdfFileName, toFileSafeName } from "@/lib/domain/normalize";

describe("normalizeTeamName", () => {
  it("trims, collapses whitespace and lower-cases", () => {
    expect(normalizeTeamName("  Code   Ninjas  ")).toBe("code ninjas");
    expect(normalizeTeamName("CODE\tNINJAS")).toBe("code ninjas");
    expect(normalizeTeamName("code\n ninjas")).toBe("code ninjas");
  });
  it("treats case/spacing variants as the same team", () => {
    const variants = ["Code Ninjas", "code ninjas", " CODE  NINJAS ", "Code Ninjas"];
    expect(new Set(variants.map(normalizeTeamName)).size).toBe(1);
  });
  it("keeps different names distinct", () => {
    expect(normalizeTeamName("Code Ninjas")).not.toBe(normalizeTeamName("Code Ninja"));
  });
});

describe("cleanTeamName / normalizeEmail", () => {
  it("cleans display names without changing case", () => {
    expect(cleanTeamName("  Byte   Brigade ")).toBe("Byte Brigade");
  });
  it("normalises emails", () => {
    expect(normalizeEmail("  Aarav.Sharma@Example.EDU ")).toBe("aarav.sharma@example.edu");
  });
});

describe("PDF filename", () => {
  it("follows <NormalizedTeamName>_<TeamID>_ID_Cards.pdf", () => {
    expect(teamPdfFileName("Code Ninjas", "TEAM-2026-0001")).toBe("Code_Ninjas_TEAM-2026-0001_ID_Cards.pdf");
  });
  it("strips unsafe characters and diacritics", () => {
    expect(toFileSafeName("  Zoë's Team / #1!! ")).toBe("Zoe_s_Team_1");
    expect(teamPdfFileName("../../etc/passwd", "TEAM-2026-0002")).toBe("etc_passwd_TEAM-2026-0002_ID_Cards.pdf");
  });
  it("falls back when nothing usable remains", () => {
    expect(toFileSafeName("🚀🚀")).toBe("Team");
  });
  it("limits length", () => {
    expect(toFileSafeName("a".repeat(200)).length).toBe(60);
  });
});
