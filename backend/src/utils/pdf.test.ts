import { describe, expect, it } from "vitest";
import type { CsvValue } from "./csv.js";
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

  it("carries a document information dictionary, so a viewer shows the real title", () => {
    const pdf = asText(toPdfTable(options));
    expect(pdf).toContain("/Info");
    expect(pdf).toMatch(/\/Title \([^)]*CNCS Property[^)]*\)/);
    expect(pdf).toContain("/Author (CNCS Property Management System)");
    expect(pdf).toContain("/CreationDate (D:");
  });

  it("uses the human column labels a report supplies, not the raw keys", () => {
    const pdf = asText(
      toPdfTable({
        ...options,
        columnLabels: { tagId: "Tag ID", name: "Item", department: "Department" },
      }),
    );

    expect(pdf).toContain("(Tag ID) Tj");
    expect(pdf).toContain("(Department) Tj");
    expect(pdf).not.toContain("(TAGID) Tj");
  });

  it("prints the scope lines a report passes as meta, below the title block", () => {
    const pdf = asText(
      toPdfTable({ ...options, meta: ["Scope: all departments", "Records: 2"] }),
    );

    expect(pdf).toContain("(Scope: all departments) Tj");
    expect(pdf).toContain("(Records: 2) Tj");
  });

  it("right-aligns a numeric column and leaves a text column left-aligned", () => {
    const pdf = asText(
      toPdfTable({
        title: "Amounts",
        headers: ["name", "cost"],
        rows: [
          { name: "P", cost: "5" },
          { name: "PPPP", cost: "1000" },
        ],
      }),
    );

    // Every text op is `1 0 0 1 <x> <y> Tm (value) Tj`, so the anchor is readable.
    const costXs = [...pdf.matchAll(/1 0 0 1 ([\d.]+) [\d.]+ Tm \((\d+)\) Tj/g)].map((m) =>
      Number(m[1]),
    );
    expect(costXs).toHaveLength(2);
    // A right-aligned column shares its right edge, so the shorter number starts
    // further right. Left-aligned, both would start at the same x.
    expect(costXs[0]).toBeGreaterThan(costXs[1]!);

    const nameXs = [...pdf.matchAll(/1 0 0 1 ([\d.]+) [\d.]+ Tm \(P+\) Tj/g)].map((m) =>
      Number(m[1]),
    );
    expect(nameXs).toHaveLength(2);
    expect(nameXs[0]).toBe(nameXs[1]);
  });

  it("splits a table wider than the page into labelled parts, losing no column", () => {
    const headers = Array.from({ length: 20 }, (_, i) => `column${i}`);
    const row: Record<string, CsvValue> = {};
    for (const header of headers) row[header] = `Value for ${header}`;

    const pdf = asText(toPdfTable({ ...options, headers, rows: [row] }));

    expect(pdf).toContain("Part 1 of 2");
    expect(pdf).toContain("Part 2 of 2");
    // The identifier column repeats in every part, so a row in part 2 can still be
    // tied back to its row in part 1.
    expect((pdf.match(/\(COLUMN0\) Tj/g) ?? []).length).toBe(2);
    // The last column's value survives in full — the alternative was truncating
    // all twenty columns into `COLU...` to keep them on one page.
    expect(pdf).toContain("Value for column19");
    expect(pdf).not.toContain("COLU...");
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
    // Amharic has no glyph in Helvetica/WinAnsi, so it is replaced rather than
    // written raw (which would corrupt the file).
    expect(pdf).not.toMatch(/[\u1200-\u137F]/);
  });

  it("folds typographic punctuation to ASCII instead of printing question marks", () => {
    // The base title is "CNCS Property — Inventory report", with an em dash.
    const pdf = asText(toPdfTable(options));
    expect(pdf).toContain("CNCS Property - Inventory report");
    expect(pdf).not.toContain("?");
  });
});
