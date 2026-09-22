import type { ItemStatus } from "./enums";

/**
 * Typed from `backend/src/routes/reports.ts`. All three exports are CSV only —
 * `?format=` anything else is a 400, not a silent JSON fallback (F10.2's PDF is
 * deliberately not built; see docs/frontend-phase-3.md).
 *
 * Dates are sent as `YYYY-MM-DD` strings; the server parses them as UTC and
 * `dateTo` includes the whole UTC day. Every date control in the reports UI is
 * therefore labelled UTC — a bare date range would otherwise silently lose or
 * gain a day depending on the viewer's timezone.
 */

export interface InventoryReportQuery {
  department?: string;
  categoryId?: string;
  status?: ItemStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface DisposalsReportQuery {
  department?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * A downloaded file and the name it should be saved under. The API module builds
 * the name (mirroring the server's `Content-Disposition`) rather than reading it
 * from the response, because `apiClient.blob()` deliberately returns just the
 * blob — one less header for every caller to parse.
 */
export interface ReportDownload {
  blob: Blob;
  filename: string;
}

/** Optional-value helpers: `exactOptionalPropertyTypes` means `{}` not `{ x: undefined }`. */
export function compactReportQuery<T extends object>(query: T): T {
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== "");
  return Object.fromEntries(entries) as T;
}
