import { describe, expect, it } from "vitest";
import { canTransition, nextStatuses, SUPPORT_STATUSES } from "@/lib/domain/support";

describe("support status transitions", () => {
  it("follows New → Assigned → In Progress → Resolved → Closed", () => {
    expect(canTransition("new", "assigned")).toBe(true);
    expect(canTransition("assigned", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "resolved")).toBe(true);
    expect(canTransition("resolved", "closed")).toBe(true);
  });
  it("allows reopening a resolved request", () => {
    expect(canTransition("resolved", "in_progress")).toBe(true);
  });
  it("forbids skipping backwards or leaving closed", () => {
    expect(canTransition("in_progress", "new")).toBe(false);
    expect(canTransition("assigned", "new")).toBe(false);
    for (const s of SUPPORT_STATUSES) if (s !== "closed") expect(canTransition("closed", s)).toBe(false);
    expect(nextStatuses("closed")).toEqual([]);
  });
  it("treats no-op transitions as allowed", () => {
    for (const s of SUPPORT_STATUSES) expect(canTransition(s, s)).toBe(true);
  });
});
