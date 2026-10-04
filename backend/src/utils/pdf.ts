/**
 * Minimal PDF table writer for report exports (Phase 3, SRS F10.2).
 *
 * Hand-rolled for the same reason `utils/csv.ts` is: no PDF library is
 * installed, and three call sites do not justify adding one (which would also
 * mean a regenerated lockfile and CI's `--frozen-lockfile`). It renders a flat
 * text table in Courier — the one standard PDF font that is monospaced, so
 * columns line up without embedding a font or measuring glyph widths.
 *
 * Deliberately small and boring. It writes uncompressed content streams, so the
 * text is inspectable and `pdftotext` reads it back exactly; it escapes the
 * three characters that matter in a PDF string literal; and it strips anything
 * outside printable ASCII, because a standard Type1 font has no glyph for
 * Amharic and a raw high byte would corrupt the file rather than fail loudly.
 *
 * What it does *not* do: images, rich text, wrapping a cell across lines, or
 * right-alignment. A report is a spreadsheet; a monospaced grid is the honest
 * rendering of one.
 */

import type { CsvValue } from "./csv.js";

export interface PdfTableOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Array<Record<string, CsvValue>>;
}

/** A4 landscape, in PDF points (72 per inch). Reports are wide, not tall. */
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 24;
const FONT_SIZE = 7;
const LINE_HEIGHT = 9;
/** Courier's advance width is exactly 0.6 em, which is what makes char math exact. */
const CHAR_WIDTH = FONT_SIZE * 0.6;
const TITLE_FONT_SIZE = 11;
const SUBTITLE_FONT_SIZE = 7;
/** Space reserved on every page for the title block and the page-number footer. */
const TITLE_BLOCK = 44;
const FOOTER_BLOCK = 18;
const COLUMN_GAP = 1;

const MAX_LINE_CHARS = Math.floor((PAGE_WIDTH - MARGIN * 2) / CHAR_WIDTH);

function cellText(value: CsvValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

/**
 * Newlines/tabs become spaces and anything non-printable-ASCII becomes `?`.
 * A `disposalReason` is free text and may contain a line break, which would
 * otherwise split one row across two output lines and misalign the table.
 */
function printable(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E]/g, "?");
}

/** Escapes the three characters that end a PDF string literal early. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function computeWidths(headers: string[], rows: Array<Record<string, CsvValue>>): number[] {
  const widths = headers.map((header, index) => {
    let width = printable(header).length;
    for (const row of rows) {
      width = Math.max(width, printable(cellText(row[headers[index]!])).length);
    }
    return Math.max(3, width);
  });

  const budget = MAX_LINE_CHARS - (headers.length - 1) * COLUMN_GAP;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total > budget) {
    const scale = budget / total;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.max(3, Math.floor(widths[i]! * scale));
    }
  }
  return widths;
}

function buildTableLines(
  headers: string[],
  rows: Array<Record<string, CsvValue>>,
): string[] {
  const widths = computeWidths(headers, rows);
  const formatLine = (cells: string[]) =>
    cells.map((cell, index) => cell.slice(0, widths[index]!).padEnd(widths[index]!)).join(" ".repeat(COLUMN_GAP));

  const headerLine = formatLine(headers.map((header) => printable(header).toUpperCase()));
  const ruleLine = widths.map((width) => "-".repeat(width)).join(" ".repeat(COLUMN_GAP));
  const bodyLines = rows.map((row) =>
    formatLine(headers.map((header) => printable(cellText(row[header])))),
  );

  return [headerLine, ruleLine, ...bodyLines];
}

function buildContentStream(
  pageLines: string[],
  title: string,
  subtitle: string | undefined,
  pageNumber: number,
  pageCount: number,
): string {
  const parts: string[] = ["BT"];

  parts.push(`/F1 ${TITLE_FONT_SIZE} Tf`);
  parts.push(`1 0 0 1 ${MARGIN} ${PAGE_HEIGHT - MARGIN - TITLE_FONT_SIZE} Tm`);
  parts.push(`(${escapeText(printable(title))}) Tj`);

  let cursorY = PAGE_HEIGHT - MARGIN - TITLE_FONT_SIZE - 12;
  if (subtitle) {
    parts.push(`/F1 ${SUBTITLE_FONT_SIZE} Tf`);
    parts.push(`1 0 0 1 ${MARGIN} ${cursorY} Tm`);
    parts.push(`(${escapeText(printable(subtitle))}) Tj`);
    cursorY -= 12;
  }

  parts.push(`/F1 ${FONT_SIZE} Tf`);
  parts.push(`1 0 0 1 ${MARGIN} ${cursorY - 6} Tm`);
  for (const line of pageLines) {
    parts.push(`(${escapeText(line)}) Tj`);
    parts.push(`0 -${LINE_HEIGHT} Td`);
  }

  parts.push("/F1 7 Tf");
  parts.push(`1 0 0 1 ${MARGIN} ${MARGIN} Tm`);
  parts.push(`(${escapeText(`Page ${pageNumber} of ${pageCount}`)}) Tj`);

  parts.push("ET");
  return parts.join("\n");
}

/**
 * Serializes a table as a PDF. Returns a Buffer so Express can `send()` it
 * directly, exactly as the CSV path sends a string.
 */
export function toPdfTable({ title, subtitle, headers, rows }: PdfTableOptions): Buffer {
  const tableLines = buildTableLines(headers, rows);
  const linesPerPage = Math.max(
    1,
    Math.floor((PAGE_HEIGHT - MARGIN * 2 - TITLE_BLOCK - FOOTER_BLOCK) / LINE_HEIGHT),
  );

  const pages: string[][] = [];
  for (let start = 0; start < tableLines.length; start += linesPerPage) {
    pages.push(tableLines.slice(start, start + linesPerPage));
  }
  if (pages.length === 0) {
    pages.push([]);
  }
  const pageCount = pages.length;

  // 1-based object bodies. The catalog and page tree are reserved first because
  // they are referenced before their final contents are known.
  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const catalogNumber = addObject("");
  const pagesNumber = addObject("");
  const fontNumber = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  );

  const pageNumbers: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    const content = buildContentStream(pages[i]!, title, subtitle, i + 1, pageCount);
    const contentNumber = addObject(
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
    const pageNumber = addObject(
      `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    );
    pageNumbers.push(pageNumber);
  }

  objects[catalogNumber - 1] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`;
  objects[pagesNumber - 1] =
    `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  // Everything written here is printable ASCII, so string length equals byte
  // length and the xref offsets below stay correct.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  const objectCount = objects.length + 1;
  pdf += `xref\n0 ${objectCount}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objectCount} /Root ${catalogNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
