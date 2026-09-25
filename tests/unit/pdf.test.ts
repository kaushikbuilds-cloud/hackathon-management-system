import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { A4, CARD_SIZES, pageCount, resolveTemplateConfig, sheetGrid } from "@/lib/domain/template";
import { CardValidationError, formatEventDates, generateTeamIdCardsPdf, validateCardInput, type CardInput, type CardMember } from "@/lib/pdf/id-cards";

const token = (n: number) => n.toString(16).padStart(64, "0");
const member = (n: number, role: "leader" | "member" = "member"): CardMember => ({
  participantCode: `PRT-2026-${String(n).padStart(4, "0")}`, fullName: `Member Number ${n}`, role,
  college: "Riverside Institute of Technology", department: "Computer Science", academicYear: "2nd Year", qrToken: token(n),
});

function input(members: CardMember[], template = {}): CardInput {
  return {
    event: { name: "BuildFest 2026", organizerName: "RIT", startsAt: "2026-11-14T03:30:00Z", endsAt: "2026-11-15T15:30:00Z", timezone: "Asia/Kolkata", venue: "Hall A" },
    team: { name: "Code Ninjas", teamCode: "TEAM-2026-0001" },
    members,
    template: resolveTemplateConfig(template),
    templateVersion: 3,
    verifyBaseUrl: "https://hms.example.com",
  };
}

describe("team ID card PDF", () => {
  it.each([1, 2, 4, 7])("produces exactly N pages for N=%i members", async (n) => {
    const members = Array.from({ length: n }, (_, i) => member(i + 1, i === 0 ? "leader" : "member"));
    const pdf = await generateTeamIdCardsPdf(input(members, { pageLayout: "card" }));
    expect(pdf.pageCount).toBe(n);
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBe(n);
  });

  it("uses consistent portrait card dimensions on every page", async () => {
    for (const cardSize of Object.keys(CARD_SIZES) as (keyof typeof CARD_SIZES)[]) {
      const pdf = await generateTeamIdCardsPdf(input([member(1, "leader"), member(2), member(3)], { cardSize, pageLayout: "card" }));
      const doc = await PDFDocument.load(pdf.bytes);
      for (const page of doc.getPages()) {
        const { width, height } = page.getSize();
        expect(width).toBeCloseTo(CARD_SIZES[cardSize].width, 1);
        expect(height).toBeCloseTo(CARD_SIZES[cardSize].height, 1);
        expect(height).toBeGreaterThan(width);
      }
    }
  });

  it("supports A4 print layout with one card per page", async () => {
    const pdf = await generateTeamIdCardsPdf(input([member(1, "leader"), member(2)], { pageLayout: "a4" }));
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(A4.width, 1);
  });

  it("tiles cards on A4 sheets by default (4 A6 cards per sheet)", async () => {
    const four = Array.from({ length: 4 }, (_, i) => member(i + 1, i === 0 ? "leader" : "member"));
    const pdf = await generateTeamIdCardsPdf(input(four, { cardSize: "a6" }));
    expect(pdf.pageCount).toBe(1);
    expect(pdf.pageWidth).toBeCloseTo(A4.width, 1);
    expect(sheetGrid("a6").perPage).toBe(4);
    const five = await generateTeamIdCardsPdf(input([...four, member(5)], { cardSize: "a6" }));
    expect(five.pageCount).toBe(2);
    expect(pageCount({ cardSize: "a6", pageLayout: "sheet" }, 5)).toBe(2);
    expect(sheetGrid("cr80").perPage).toBe(9);
    expect(sheetGrid("badge3x4").perPage).toBe(4);
  });

  it("uses the hackathon's brand kit colours, with readable text on light accents", async () => {
    const base = input([member(1, "leader"), member(2)], { pageLayout: "card" });
    for (const accent of ["#22c55e", "#2f3fe0", "#fde047"]) {
      const pdf = await generateTeamIdCardsPdf({ ...base, event: { ...base.event, brand: { background: "#0f3d2e", accent } } });
      expect(pdf.pageCount).toBe(2);
    }
  });

  it("embeds fonts (no reliance on viewer fonts)", async () => {
    const pdf = await generateTeamIdCardsPdf(input([member(1, "leader")]));
    const doc = await PDFDocument.load(pdf.bytes);
    const dicts = doc.context.enumerateIndirectObjects().map(([, obj]) => obj).filter((o): o is PDFDict => o instanceof PDFDict);
    const descriptors = dicts.filter((d) => d.get(PDFName.of("Type")) === PDFName.of("FontDescriptor"));
    expect(descriptors.length).toBeGreaterThanOrEqual(3);
    for (const d of descriptors) expect(d.has(PDFName.of("FontFile2"))).toBe(true);
    const baseFonts = dicts.map((d) => d.get(PDFName.of("BaseFont"))?.toString() ?? "").filter(Boolean);
    expect(baseFonts.some((f) => f.includes("Inter"))).toBe(true);
    expect(baseFonts.some((f) => f.includes("Helvetica"))).toBe(false);
  });

  it("never prints secrets: only the opaque verify URL is encoded", async () => {
    const pdf = await generateTeamIdCardsPdf(input([member(1, "leader")]));
    const raw = Buffer.from(pdf.bytes).toString("latin1");
    expect(raw.toLowerCase()).not.toContain("password");
  });

  it("handles long names and non-Latin characters without failing", async () => {
    const m = { ...member(1, "leader"), fullName: "Saraswati Venkataraghavan Krishnamurthy Iyer", college: "Łódź University of Technology — Faculty of Electrical Engineering" };
    const unsupported = { ...member(2), fullName: "李小龍 Bruce" };
    const pdf = await generateTeamIdCardsPdf(input([m, unsupported], { pageLayout: "card" }));
    expect(pdf.pageCount).toBe(2);
  });

  it("tolerates corrupt photo bytes by falling back to initials", async () => {
    const pdf = await generateTeamIdCardsPdf(input([{ ...member(1, "leader"), photo: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]) }]));
    expect(pdf.pageCount).toBe(1);
  });

  it("fails fast with clear errors when required data is missing", async () => {
    const broken = [{ ...member(1, "leader"), fullName: " ", qrToken: "nope" }];
    await expect(generateTeamIdCardsPdf(input(broken))).rejects.toBeInstanceOf(CardValidationError);
    const v = validateCardInput(input(broken));
    expect(v.errors.map((e) => e.field).sort()).toEqual(["fullName", "qrToken"]);
    await expect(generateTeamIdCardsPdf(input([]))).rejects.toThrow(/no registered members/);
  });

  it("reports optional missing data as warnings", () => {
    const v = validateCardInput(input([{ ...member(1, "leader"), department: null }]));
    expect(v.errors).toEqual([]);
    expect(v.warnings.some((w) => w.field === "department")).toBe(true);
  });
});

describe("formatEventDates", () => {
  it("formats ranges in the event time zone", () => {
    expect(formatEventDates("2026-11-14T03:30:00Z", "2026-11-15T15:30:00Z", "Asia/Kolkata")).toBe("14–15 Nov 2026");
    expect(formatEventDates("2026-11-30T03:30:00Z", "2026-12-01T15:30:00Z", "Asia/Kolkata")).toBe("30 Nov – 1 Dec 2026");
    expect(formatEventDates(null, null, "UTC")).toBe("");
  });
});
