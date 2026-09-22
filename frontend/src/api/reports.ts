import { apiClient, downloadBlob } from "../lib/apiClient";
import { compactReportQuery, type DisposalsReportQuery, type InventoryReportQuery, type ReportDownload } from "../types/report";

/**
 * Report exports (F10) — Staff/Admin, CSV only.
 *
 * Every one of these goes through `apiClient.blob()`, never a plain `<a href>`:
 * the endpoints sit behind `authenticate`, so a bare link would send no Bearer
 * token and download a 401 body named `.csv` — the exact bug the plan calls out
 * (frontend-plan.md §4, §7). Nothing in this module is cached or retried.
 */

/**
 * Mirrors the server's `todayStamp()` (`routes/reports.ts`): both are
 * `toISOString().slice(0, 10)`, i.e. the UTC date. Keeping the two in the same
 * format means a downloaded file is named identically whether the browser picks
 * the name up from `Content-Disposition` or from here.
 */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `GET /reports/inventory` — one row per item, disposed items included (F7.2). */
export async function downloadInventoryReport(query: InventoryReportQuery): Promise<ReportDownload> {
  const blob = await apiClient.blob("/reports/inventory", {
    ...compactReportQuery(query),
    format: "csv",
  });
  return { blob, filename: `inventory-report-${todayStamp()}.csv` };
}

/** `GET /reports/disposals` — one row per *decided* disposal request. */
export async function downloadDisposalsReport(query: DisposalsReportQuery): Promise<ReportDownload> {
  const blob = await apiClient.blob("/reports/disposals", {
    ...compactReportQuery(query),
    format: "csv",
  });
  return { blob, filename: `disposals-report-${todayStamp()}.csv` };
}

/**
 * `GET /reports/audit/:auditId` — works for an in-progress session too (only
 * `FOUND` rows exist yet), so the report page offers it before completion.
 */
export async function downloadAuditReport(auditId: string): Promise<ReportDownload> {
  const blob = await apiClient.blob(`/reports/audit/${encodeURIComponent(auditId)}`, { format: "csv" });
  return { blob, filename: `audit-report-${auditId}.csv` };
}

/** Ties a fetched report to the browser download in one call, for click handlers. */
export async function saveReport(fetchReport: () => Promise<ReportDownload>): Promise<string> {
  const { blob, filename } = await fetchReport();
  downloadBlob(blob, filename);
  return filename;
}
