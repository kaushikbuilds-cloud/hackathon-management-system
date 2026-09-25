import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => { throw new Error("not used"); } }));
vi.mock("@/lib/accounts", () => ({ recordCredentialEvent: vi.fn() }));
vi.mock("@/lib/invitations", () => ({ acceptInvitation: vi.fn(), createInvitation: vi.fn() }));

const { ACTIVATION_CODE_RE, generateActivationCode, normalizeActivationCode } = await import("@/lib/activation");

describe("activation codes", () => {
  it("are 8 unambiguous characters", () => {
    const codes = new Set(Array.from({ length: 500 }, generateActivationCode));
    for (const c of codes) {
      expect(c).toMatch(ACTIVATION_CODE_RE);
      expect(c).not.toMatch(/[01ILO]/);
    }
    expect(codes.size).toBeGreaterThan(495);
  });

  it("normalizes what people type", () => {
    expect(normalizeActivationCode(" x7k9-m2q4 ")).toBe("X7K9M2Q4");
    expect(normalizeActivationCode("X7K9 M2Q4")).toBe("X7K9M2Q4");
  });
});
