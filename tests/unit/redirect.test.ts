import { describe, expect, it } from "vitest";
import { sameSiteUrl } from "@/lib/redirect";

const origin = "https://hackgroundos.vercel.app";
const to = (next: string | null) => sameSiteUrl(next, origin, "/change-password").href;

describe("sameSiteUrl", () => {
  it("keeps paths on this site", () => {
    expect(to("/portal?tab=food")).toBe(`${origin}/portal?tab=food`);
    expect(to(null)).toBe(`${origin}/change-password`);
  });

  it("never leaves the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com"]) {
      expect(to(bad)).toBe(`${origin}/change-password`);
    }
  });
});
