import { describe, expect, it } from "vitest";
import { extractQrToken, formatCode, isParticipantCode, isQrToken, isTeamCode } from "@/lib/domain/ids";

describe("formatCode", () => {
  it("pads to four digits", () => {
    expect(formatCode("TEAM", 2026, 1)).toBe("TEAM-2026-0001");
    expect(formatCode("PRT", 2026, 42)).toBe("PRT-2026-0042");
  });
  it("never truncates large sequence values", () => {
    expect(formatCode("TEAM", 2026, 12345)).toBe("TEAM-2026-12345");
  });
  it("rejects invalid sequence values", () => {
    expect(() => formatCode("TEAM", 2026, 0)).toThrow();
    expect(() => formatCode("TEAM", 2026, 1.5)).toThrow();
  });
  it("produces unique codes for unique sequence values", () => {
    const codes = Array.from({ length: 2000 }, (_, i) => formatCode("PRT", 2026, i + 1));
    expect(new Set(codes).size).toBe(2000);
  });
});

describe("code validation", () => {
  it("recognises valid codes", () => {
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
