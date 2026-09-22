import { apiClient } from "../lib/apiClient";
import type {
  AuditCompletionResponse,
  AuditScanRow,
  AuditSession,
  CreateAuditPayload,
} from "../types/audit";

/**
 * Audit sessions (F9) — Staff/Admin. Three calls, no reads: the backend exposes
 * create / scan / complete and nothing else (gap G1), so the client carries the
 * session in the URL and the summary in router state (see
 * `lib/auditWalkthrough.ts`).
 */

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
