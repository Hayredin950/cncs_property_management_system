import { describe, expect, it } from "vitest";
import { formatCurrencyETB, formatDateUTC, formatDateTimeUTC, formatRelativeTime, parseScannedTagId } from "./formatters";

describe("formatCurrencyETB", () => {
  // The API serializes Prisma.Decimal as strings (frontend-plan.md §4) — the
  // string path is the *normal* case, not an edge case.
  it("formats the string-decimal the API actually sends", () => {
    expect(formatCurrencyETB("45000")).toBe("ETB 45,000.00");
  });

  it("groups thousands and keeps two decimals", () => {
    expect(formatCurrencyETB("1234567.891")).toBe("ETB 1,234,567.89");
  });

  it("prefixes ETB by hand — never Intl currency formatting", () => {
    // en-ET ICU data for Birr is not guaranteed across browsers (§13); the
    // output below is the hand-built format, asserting it stays that way.
    expect(formatCurrencyETB(0)).toBe("ETB 0.00");
  });

  it("keeps a negative sign", () => {
    expect(formatCurrencyETB("-1250.5")).toBe("-ETB 1,250.50");
  });

  it("returns null for empty, null, undefined, and non-numeric input", () => {
    expect(formatCurrencyETB(null)).toBeNull();
    expect(formatCurrencyETB(undefined)).toBeNull();
    expect(formatCurrencyETB("")).toBeNull();
    expect(formatCurrencyETB("not-a-number")).toBeNull();
  });
});

describe("formatDateUTC / formatDateTimeUTC", () => {
  it("formats in UTC regardless of the machine's timezone", () => {
    // 2026-09-15T23:30:00Z is Sep 16 in Addis Ababa (UTC+3) — the date must
    // still read as the UTC day, not drift with the runtime's zone.
    // "Sep" vs "Sept" varies by ICU/CLDR version (exactly the locale-data
    // instability frontend-plan.md §13 warns about), so accept either.
    expect(formatDateUTC("2026-09-15T23:30:00.000Z")).toMatch(/^15 Sept? 2026$/);
    expect(formatDateTimeUTC("2026-09-15T23:30:00.000Z")).toMatch(/^15 Sept? 2026, 23:30 UTC$/);
  });

  it("labels the full timestamp UTC explicitly", () => {
    expect(formatDateTimeUTC("2026-01-01T00:00:00.000Z")).toContain("UTC");
  });

  it("returns null for null/undefined/invalid input", () => {
    expect(formatDateUTC(null)).toBeNull();
    expect(formatDateUTC(undefined)).toBeNull();
    expect(formatDateUTC("garbage")).toBeNull();
    expect(formatDateTimeUTC("garbage")).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");

  it("says 'Just now' under a minute", () => {
    expect(formatRelativeTime("2026-09-21T11:59:30.000Z", now)).toBe("Just now");
  });

  it("formats minutes, hours, and days", () => {
    expect(formatRelativeTime("2026-09-21T11:30:00.000Z", now)).toBe("30 min. ago");
    expect(formatRelativeTime("2026-09-21T09:00:00.000Z", now)).toBe("3 hr. ago");
    expect(formatRelativeTime("2026-09-18T12:00:00.000Z", now)).toBe("3 days ago");
  });
});

describe("parseScannedTagId", () => {
  it("extracts the tag from a full QR-encoded URL", () => {
    // qrGenerator encodes `${PUBLIC_BASE_URL}/item/:tagId` (frontend-plan.md §6).
    expect(parseScannedTagId("http://localhost:5173/item/CNCS-AB12CD34")).toBe("CNCS-AB12CD34");
    expect(parseScannedTagId("https://cncs.example.et/item/CNCS-AB12CD34?from=poster")).toBe("CNCS-AB12CD34");
  });

  it("accepts a bare tag typed or scanned directly", () => {
    expect(parseScannedTagId("CNCS-AB12CD34")).toBe("CNCS-AB12CD34");
  });

  it("normalizes casing either way", () => {
    expect(parseScannedTagId("cncs-ab12cd34")).toBe("CNCS-AB12CD34");
    expect(parseScannedTagId("http://localhost:5173/item/cncs-ab12cd34")).toBe("CNCS-AB12CD34");
  });

  it("trims stray whitespace from a phone keyboard", () => {
    expect(parseScannedTagId("  CNCS-AB12CD34 \n")).toBe("CNCS-AB12CD34");
  });

  it("returns null for empty input", () => {
    expect(parseScannedTagId("")).toBeNull();
    expect(parseScannedTagId("   ")).toBeNull();
  });
});
