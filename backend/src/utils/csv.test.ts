import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.js";

describe("toCsv", () => {
  it("writes a header row and one data row per record, CRLF-terminated", () => {
    const csv = toCsv(["tagId", "name"], [{ tagId: "CNCS-0001", name: "Laptop" }]);
    expect(csv).toBe("tagId,name\r\nCNCS-0001,Laptop\r\n");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv(["name"], [{ name: "Chair, office" }]);
    expect(csv).toContain('"Chair, office"');
  });

  it("doubles an embedded quote and wraps the field in quotes", () => {
    const csv = toCsv(["name"], [{ name: 'The "good" one' }]);
    expect(csv).toContain('"The ""good"" one"');
  });

  it("quotes a field containing a line break", () => {
    const csv = toCsv(["notes"], [{ notes: "Line one\nLine two" }]);
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("does not quote a plain field", () => {
    const csv = toCsv(["status"], [{ status: "ACTIVE" }]);
    expect(csv).not.toContain('"');
  });

  it("renders null and undefined as an empty field, not the string 'null'", () => {
    const csv = toCsv(["a", "b"], [{ a: null, b: undefined }]);
    expect(csv).toBe("a,b\r\n,\r\n");
  });

  it("serializes a Date as ISO 8601", () => {
    const date = new Date("2026-03-15T10:00:00.000Z");
    const csv = toCsv(["scannedAt"], [{ scannedAt: date }]);
    expect(csv).toContain("2026-03-15T10:00:00.000Z");
  });

  it("looks columns up by header name, so a row missing a key becomes one empty field rather than shifting later columns", () => {
    const csv = toCsv(["a", "b", "c"], [{ a: "1", c: "3" }]);
    expect(csv).toBe("a,b,c\r\n1,,3\r\n");
  });

  it("emits only the header row for an empty dataset", () => {
    expect(toCsv(["tagId", "name"], [])).toBe("tagId,name\r\n");
  });
});
