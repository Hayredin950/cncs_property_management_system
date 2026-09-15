/**
 * RFC 4180 CSV serialization for report exports (Phase 3, SRS F10).
 *
 * No CSV library is installed (`package.json` has none, and nothing else in
 * the codebase writes CSV), so this is hand-rolled rather than adding a
 * dependency for three call sites. Kept deliberately small: quote a field
 * only when it needs it, double any embedded quotes, and never reorder or
 * drop a column just because a row is missing a key.
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

/**
 * Quotes a field only if it contains a comma, a quote, or a line break —
 * matching what Excel/Sheets/LibreOffice all expect on import. An embedded
 * quote is escaped by doubling it, per RFC 4180 §2.7.
 */
function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Builds a CSV string from an ordered list of column headers and an array of
 * row objects. Rows are looked up by header name rather than positionally, so
 * a row missing a key becomes one empty field instead of shifting every
 * column after it out of alignment — the failure mode that's easy to miss in
 * a quick manual test but corrupts every row in a real export.
 *
 * CRLF line endings on purpose: RFC 4180's wire format, and what every
 * spreadsheet importer is written to expect from a `.csv` attachment.
 */
export function toCsv(headers: string[], rows: Array<Record<string, CsvValue>>): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvField(row[header])).join(","),
  );
  return [headerLine, ...dataLines].join("\r\n") + "\r\n";
}
