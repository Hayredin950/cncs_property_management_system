import { apiClient } from "../lib/apiClient";
import type {
  AuditCompletionResponse,
  AuditScanRow,
  AuditSession,
  AuditSessionReadback,
  CreateAuditPayload,
} from "../types/audit";

/**
 * Audit sessions (F9) — Staff/Admin: create, scan, complete, and now read a
 * session back (`GET /audits/:id`, which closes gap G1). The client still
 * mirrors the summary into router state so the report renders instantly after
 * completion, but a reload now falls back to the read-back instead of losing it.
 */

/**
 * `GET /audits/:id` — a session and its stored result rows. `404` for an unknown
 * id; a session that is still open comes back with `completed: false`.
 */
export function fetchAuditSession(
  auditId: string,
  signal?: AbortSignal,
): Promise<AuditSessionReadback> {
  return apiClient.get<AuditSessionReadback>(`/audits/${encodeURIComponent(auditId)}`, undefined, signal);
}

/**
 * `POST /audits` — starts a session. Only `scopeType: "DEPARTMENT"` is offered by
 * the UI because completion answers 400 for anything else; a department's
 * `scopeValue` is matched against `Item.department` exactly and case-sensitively,
 * which is why the form uses `LockedDepartmentPicker` rather than free text (G9).
 */
export function createAuditSession(payload: CreateAuditPayload): Promise<AuditSession> {
  return apiClient.post<AuditSession>("/audits", payload);
}

/**
 * `POST /audits/:id/scan` — records one physical scan. The client sends only the
 * item id; `result` is always `FOUND` server-side and the final classification is
 * computed at completion, so a client can never declare its own result.
 *
 * `409` when the session is already completed, `404` for an unknown session or
 * item — both surface as `ApiError` for the page to branch on.
 */
export function scanAuditItem(auditId: string, itemId: string): Promise<AuditScanRow> {
  return apiClient.post<AuditScanRow>(`/audits/${encodeURIComponent(auditId)}/scan`, { itemId });
}

/**
 * `POST /audits/:id/complete` — finalizes the audit and returns the summary.
 * Idempotence is *not* promised by the API: completing twice answers `409`, so
 * the UI confirms before calling and never retries on its own.
 */
export function completeAuditSession(auditId: string): Promise<AuditCompletionResponse> {
  return apiClient.post<AuditCompletionResponse>(`/audits/${encodeURIComponent(auditId)}/complete`);
}
