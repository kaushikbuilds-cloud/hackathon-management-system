import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/domain/csv";
import { checkPasswordStrength, generateTemporaryPassword } from "@/lib/domain/password";
import { parsePage, sanitizeSearch } from "@/lib/domain/search";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { sniffContentType } from "@/lib/storage";

describe("CSV", () => {
  it("quotes and escapes", () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\r\n1,\r\n");
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+123")).toBe("'+123");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});

describe("temporary passwords", () => {
  it("are strong and random", () => {
    const pws = Array.from({ length: 200 }, () => generateTemporaryPassword());
    expect(new Set(pws).size).toBe(200);
    for (const pw of pws) {
      expect(pw).toHaveLength(14);
      expect(checkPasswordStrength(pw)).toBeNull();
    }
  });
  it("strength checks reject weak passwords", () => {
    expect(checkPasswordStrength("short")).toMatch(/at least/);
    expect(checkPasswordStrength("alllowercaseletters")).toMatch(/three/);
    expect(checkPasswordStrength("Good-Passw0rd")).toBeNull();
  });
});

describe("search sanitising", () => {
  it("removes PostgREST filter syntax", () => {
    expect(sanitizeSearch("a,b),name.eq.(x)")).toBe("a b name.eq. x");
    expect(sanitizeSearch("100%_off*")).toBe("100 off");
    expect(sanitizeSearch("PRT-2026-0001")).toBe("PRT-2026-0001");
  });
  it("parses pages safely", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("abc")).toBe(1);
  });
});

describe("time zone conversion", () => {
  it("round-trips datetime-local values in the event time zone", () => {
    const iso = fromLocalInput("2026-11-14T09:00", "Asia/Kolkata");
    expect(iso).toBe("2026-11-14T03:30:00.000Z");
    expect(toLocalInput(iso, "Asia/Kolkata")).toBe("2026-11-14T09:00");
  });
  it("handles DST zones", () => {
    expect(fromLocalInput("2026-07-01T12:00", "Europe/London")).toBe("2026-07-01T11:00:00.000Z");
    expect(fromLocalInput("2026-12-01T12:00", "Europe/London")).toBe("2026-12-01T12:00:00.000Z");
  });
  it("rejects malformed input", () => {
    expect(fromLocalInput("tomorrow", "UTC")).toBeNull();
  });
});

describe("upload sniffing", () => {
  it("detects types by magic bytes, not extension", () => {
    expect(sniffContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffContentType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffContentType(new TextEncoder().encode("hello"))).toBe("text/plain");
    expect(sniffContentType(new Uint8Array([0x4d, 0x5a, 0x00, 0x90]))).toBeNull(); // Windows executable
  });
});

describe("food cart parsing", () => {
  it("keeps only known items with positive whole quantities, capped at 20", async () => {
    const { cartFromForm } = await import("@/lib/domain/food");
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    const fd = new FormData();
    fd.set(`qty_${a}`, "2");
    fd.set(`qty_${b}`, "99");
    fd.set("qty_33333333-3333-4333-8333-333333333333", "1");
    fd.set("qty_bad", "x");
    fd.set("note", "hi");
    expect(cartFromForm(fd, new Set([a, b]))).toEqual([{ item_id: a, qty: 2 }, { item_id: b, qty: 20 }]);
    const zero = new FormData();
    zero.set(`qty_${a}`, "0");
    expect(cartFromForm(zero, new Set([a]))).toEqual([]);
  });
});
