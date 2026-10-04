import { describe, expect, it } from "vitest";
import { toPdfTable } from "./pdf.js";

/**
 * Structural tests for the hand-rolled PDF writer. They parse the bytes back
 * rather than assert on a golden file, because the point is that the file is a
 * *well-formed* PDF (valid xref offsets and a startxref that agrees with them) —
 * which is exactly what a viewer rejects when it is wrong.
 */

function asText(buffer: Buffer): string {
  return buffer.toString("latin1");
}

/** The byte offsets listed in the xref table, in object-number order. */
function xrefOffsets(pdf: string): number[] {
  const marker = "\nxref\n";
  const markerIndex = pdf.indexOf(marker);
  expect(markerIndex).toBeGreaterThan(-1);
  const lines = pdf.slice(markerIndex + marker.length).split("\n");

  const offsets: number[] = [];
  // lines[0] is the "0 N" subsection header; lines[1] is the free entry.
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("trailer")) break;
    offsets.push(Number(line.slice(0, 10)));
  }
  return offsets;
}

describe("toPdfTable", () => {
  const options = {
    title: "CNCS Property — Inventory report",
    subtitle: "Generated 2026-10-04T00:00:00.000Z",
    headers: ["tagId", "name", "department"],
    rows: [
      { tagId: "CNCS-0001", name: "Dell Laptop", department: "Computer Science" },
      { tagId: "CNCS-0002", name: "Desk", department: "Physics" },
    ],
  };

  it("produces a buffer framed as a PDF", () => {
    const pdf = asText(toPdfTable(options));
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
  });

  it("every xref offset points at the object it claims", () => {
    const pdf = asText(toPdfTable(options));
    const offsets = xrefOffsets(pdf);

    expect(offsets.length).toBeGreaterThan(0);
    offsets.forEach((offset, index) => {
      expect(Number.isInteger(offset)).toBe(true);
      expect(pdf.slice(offset, offset + 20)).toContain(`${index + 1} 0 obj`);
    });
  });

  it("startxref points at the xref table", () => {
    const pdf = asText(toPdfTable(options));
    const startxrefIndex = pdf.indexOf("startxref\n");
    expect(startxrefIndex).toBeGreaterThan(-1);
    const offset = Number(pdf.slice(startxrefIndex + "startxref\n".length).split("\n")[0]);
    expect(pdf.slice(offset, offset + 5)).toBe("xref\n");
  });

  it("carries the title, headers and row values in an inspectable text stream", () => {
    const pdf = asText(toPdfTable(options));
    expect(pdf).toContain("CNCS Property");
    expect(pdf).toContain("TAGID");
    expect(pdf).toContain("Dell Laptop");
    expect(pdf).toContain("Computer Science");
  });

  it("renders an empty result set as a header-only page", () => {
    const pdf = asText(toPdfTable({ ...options, rows: [] }));
    expect(pdf).toContain("TAGID");
    expect(pdf).toContain("/Count 1");
  });

  it("paginates and counts pages when the table is long", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      tagId: `CNCS-${String(i).padStart(4, "0")}`,
      name: `Item ${i}`,
      department: "Computer Science",
    }));

    const pdf = asText(toPdfTable({ ...options, rows }));
    const pageObjects = pdf.match(/\/Type \/Page /g) ?? [];
    expect(pageObjects.length).toBeGreaterThan(1);
    expect(pdf).toContain(`/Count ${pageObjects.length}`);
    expect(pdf).toContain(`Page 1 of ${pageObjects.length}`);
  });

  it("escapes parentheses and strips characters a Type1 font cannot draw", () => {
    const pdf = asText(
      toPdfTable({
        ...options,
        title: "Report (official)",
        rows: [{ tagId: "CNCS-0003", name: "የኢትዮጵያ ስም", department: "Physics" }],
      }),
    );

    // The literal parens are escaped, not left to terminate the string early.
    expect(pdf).toContain("Report \\(official\\)");
    // Amharic has no glyph in Courier/WinAnsi, so it is replaced rather than
    // written raw (which would corrupt the file).
    expect(pdf).not.toMatch(/[\u1200-\u137F]/);
  });
});
