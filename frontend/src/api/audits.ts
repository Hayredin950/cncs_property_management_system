import { apiClient } from "../lib/apiClient";
import type {
  AuditCompletionResponse,
  AuditListResponse,
  AuditScanRow,
  AuditSession,
  AuditSessionReadback,
  CreateAuditPayload,
} from "../types/audit";

/**
 * Audit sessions (F9) — Staff/Admin: create, scan, complete, list them, and read
 * one back. The client still mirrors the completion summary into router state so
 * the report renders instantly after completion, but a reload falls back to the
 * read-back (`GET /audits/:id`) instead of losing it, and `GET /audits` is what
 * makes a session findable again at all.
 */

/**
 * Audits per page. Fixed rather than exposed: the history is scanned by date, not
 * searched, so the page number is the only thing a caller needs to think about.
 */
export const AUDITS_PAGE_SIZE = 20;

/**
 * `GET /audits` — the sessions this viewer may see, newest first. The server does
 * the scoping (Staff see their own, Admin sees all), so the client sends no owner.
 * `mine` is an admin's filter, applied on top of that scope and never instead of
 * it, which is why it can't widen anyone's view.
 */
export function fetchAudits(
  options: { 
    mine?: boolean; 
    page?: number; 
    status?: string; 
    search?: string; 
    /** The scope the session counted — a department or a building. */
    scope?: string; 
    sortBy?: string; 
    sortOrder?: string 
  } = {},
  signal?: AbortSignal,
): Promise<AuditListResponse> {
  const page = Math.max(1, options.page ?? 1);
  return apiClient.get<AuditListResponse>(
    "/audits",
    {
      limit: AUDITS_PAGE_SIZE,
      offset: (page - 1) * AUDITS_PAGE_SIZE,
      ...(options.mine ? { mine: "true" } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.search ? { search: options.search } : {}),
      ...(options.sortBy ? { sortBy: options.sortBy } : {}),
      ...(options.sortOrder ? { sortOrder: options.sortOrder } : {}),
    },
    signal,
  );
}

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

/**
 * What the dashboard's "Current audit" tile renders: four flat fields.
 *
 * The endpoint's own shape is `{ active, session, progress }` — a state
 * discriminant plus two objects — and both of the old tile's bugs lived in the gap
 * between the two. It read `data.id`/`data.scope`/`data.scanned`/`data.total`, none
 * of which the server has ever sent, and it folded "no active audit" and "the
 * request failed" into the same `null`. Mapping once here keeps the widget flat and
 * leaves `null` meaning exactly one thing: there is nothing open.
 */
export interface ActiveAudit {
  id: string;
  /** `scopeValue` — the department being audited. */
  scope: string;
  scanned: number;
  total: number;
}

/** `GET /audits/active` — the shape the route answers with, before mapping. */
export interface ActiveAuditResponse {
  active: boolean;
  session?: { id: string; scopeType: string; scopeValue: string | null };
  progress?: { scanned: number; total: number; remaining: number };
}

/**
 * `GET /audits/active` — this auditor's open session, or `null` when there is none.
 *
 * `null` is a real answer, not a failure: an auditor with nothing open is the
 * normal state and the tile says so. A failed request throws `ApiError` instead, so
 * the tile can tell "nothing to show" from "couldn't ask".
 */
export async function fetchActiveAudit(signal?: AbortSignal): Promise<ActiveAudit | null> {
  const res = await apiClient.get<ActiveAuditResponse>("/audits/active", undefined, signal);
  if (!res.active || !res.session || !res.progress) return null;
  return {
    id: res.session.id,
    scope: res.session.scopeValue ?? res.session.scopeType,
    scanned: res.progress.scanned,
    total: res.progress.total,
  };
}

/**
 * `GET /audits/findings?status=OPEN` — items marked MISSING inside their grace
 * window. `status` is required by the route (anything else is a 400), so it is
 * sent as a query rather than left to the caller: there is only one question this
 * tile asks.
 */
export function fetchOpenFindings(signal?: AbortSignal): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>("/audits/findings", { status: "OPEN" }, signal);
}

/**
 * `POST /api/v1/audits/:id/abandon` — close a session that will not be completed.
 *
 * The session produces **no report**; that is the difference between abandoning
 * and completing, and the reason is required: an abandoned session is a record
 * of a decision not to count, and "why" is part of that record.
 */
export function abandonAuditSession(
  id: string,
  reason: string,
): Promise<{ message: string; session: { id: string; abandonedAt: string; abandonReason: string | null } }> {
  return apiClient.post(`/audits/${encodeURIComponent(id)}/abandon`, { reason });
}
