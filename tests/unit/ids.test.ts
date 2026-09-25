import { describe, expect, it } from "vitest";
import { extractQrToken, formatCode, isParticipantCode, isQrToken, isTeamCode, normalizeIdInput, participantIdInsteadOfTeamId } from "@/lib/domain/ids";

describe("formatCode", () => {
  it("joins the hackathon prefix, kind and a four-digit number", () => {
    expect(formatCode("SAMPLE1", "T", 1)).toBe("SAMPLE1-T0001");
    expect(formatCode("KH2026", "P", 42)).toBe("KH2026-P0042");
  });
  it("never truncates large sequence values", () => {
    expect(formatCode("SIH", "T", 12345)).toBe("SIH-T12345");
  });
  it("rejects invalid sequence values", () => {
    expect(() => formatCode("SIH", "T", 0)).toThrow();
    expect(() => formatCode("SIH", "T", 1.5)).toThrow();
  });
  it("produces unique codes for unique sequence values", () => {
    const codes = Array.from({ length: 2000 }, (_, i) => formatCode("SIH", "P", i + 1));
    expect(new Set(codes).size).toBe(2000);
  });
});

describe("code validation", () => {
  it("recognises prefixed codes", () => {
    expect(isTeamCode("SAMPLE1-T0001")).toBe(true);
    expect(isParticipantCode("kh2026-p10000")).toBe(true);
    expect(isTeamCode("SAMPLE1-P0001")).toBe(false);
    expect(isParticipantCode("SAMPLE1-T0001")).toBe(false);
    expect(isParticipantCode("S-P0001")).toBe(false);
    expect(isParticipantCode("SAMPLE 1-P0001")).toBe(false);
  });
  it("still accepts IDs issued before prefixes existed", () => {
    expect(isTeamCode("TEAM-2026-0001")).toBe(true);
    expect(isParticipantCode("PRT-2026-10000")).toBe(true);
    expect(isTeamCode("PRT-2026-0001")).toBe(false);
    expect(isParticipantCode("PRT-26-1")).toBe(false);
  });
});

describe("QR tokens", () => {
  const token = "a".repeat(64);
  it("accepts bare tokens and verify URLs", () => {
    expect(isQrToken(token)).toBe(true);
    expect(extractQrToken(token)).toBe(token);
    expect(extractQrToken(`https://hms.example.com/verify/${token}`)).toBe(token);
    expect(extractQrToken(`https://hms.example.com/verify/${token}?x=1`)).toBe(token);
  });
  it("rejects anything else", () => {
    expect(extractQrToken("PRT-2026-0001")).toBeNull();
    expect(extractQrToken(`https://x/verify/${"g".repeat(64)}`)).toBeNull();
    expect(extractQrToken(`https://x/verify/${token}extra`)).toBeNull();
    expect(extractQrToken("")).toBeNull();
  });
});

describe("typed IDs", () => {
  it("fixes letters typed for digits in the number part only", () => {
    expect(normalizeIdInput(" sample1-t0o01 ")).toBe("SAMPLE1-T0001");
    expect(normalizeIdInput("ROBO-PlO2")).toBe("ROBO-PLO2"); // too short to be an ID: only upper-cased
    expect(normalizeIdInput("ROBO-P0I02")).toBe("ROBO-P0102");
    expect(normalizeIdInput("PRT-2026-0001")).toBe("PRT-2026-0001");
  });
  it("explains that teams sign in with the Team ID, not a Participant ID", () => {
    expect(participantIdInsteadOfTeamId("sample1-p0oo1")).toBe(
      "SAMPLE1-P0001 is a Participant ID. Your team signs in with its Team ID (it looks like SAMPLE1-T0001), printed on every member's ID card.");
    expect(participantIdInsteadOfTeamId("PRT-2026-0001")).toMatch(/^PRT-2026-0001 is a Participant ID/);
    expect(participantIdInsteadOfTeamId("SAMPLE1-T0001")).toBeNull();
  });
});
