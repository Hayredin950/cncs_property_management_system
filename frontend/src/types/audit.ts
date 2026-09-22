import type { AuditItemResult } from "./enums";
import type { Item } from "./item";

/**
 * Typed from `backend/src/routes/audits.ts`. There is **no** `GET /audits/:id`
 * (spec-vs-backend gap G1, frontend-plan.md §12), so nothing here is a "fetch an
 * audit" shape — a session is only ever the creation response, the scans this
 * client made, and the completion response.
 */

/** One nested user reference, as the creation response selects it. */
export interface AuditUserSummary {
  id: string;
  fullName: string;
  email: string;
}

/**
 * `POST /audits` 201 response. `scopeType` stays a plain string because the API
 * accepts any non-empty value — only `DEPARTMENT` can actually be *completed*
 * (the completion endpoint 400s otherwise), which is why the UI only offers
 * department scope in the first place.
 */
export interface AuditSession {
  id: string;
  scopeType: string;
  scopeValue: string | null;
  runById: string;
  startedAt: string;
  completedAt: string | null;
  runBy: AuditUserSummary;
}

/** Body of `POST /audits`. */
export interface CreateAuditPayload {
  scopeType: string;
  scopeValue?: string | null;
}

/**
 * `POST /audits/:id/scan` 201 response — the persisted row plus its item.
 * `result` is always `FOUND` on this path by design: the final classification is
 * computed at completion, never supplied by the client.
 */
export interface AuditScanRow {
  id: string;
  auditSessionId: string;
  itemId: string;
  result: AuditItemResult;
  scannedAt: string | null;
  item: Item;
}

/**
 * What the scan walkthrough keeps for *this* session in the browser — the server
 * stores scan rows but exposes no scan listing, so the running list is the only
 * view of "what have I scanned so far". Persisted to `sessionStorage` so a phone
 * reload mid-walkthrough doesn't lose the count.
 */
export interface ScannedAuditItem {
  itemId: string;
  tagId: string;
  name: string;
  room: string;
  scannedAt: string;
}

/** In-progress walkthrough state, scoped to one audit session id. */
export interface AuditWalkthroughState {
  scopeValue: string;
  scanned: ScannedAuditItem[];
}

/**
 * `POST /audits/:id/complete` 200 response. `counts` is the summary the report
 * page renders; `found`/`missing`/`locationMismatch` are item-id lists. A
 * `MISSING` row carries no item detail, which is why the report page shows
 * counts and points at the CSV export for the per-item breakdown.
 */
export interface AuditCompletionResponse {
  auditSessionId: string;
  completedAt: string;
  counts: {
    found: number;
    missing: number;
    locationMismatch: number;
  };
  found: string[];
  missing: string[];
  locationMismatch: string[];
}
