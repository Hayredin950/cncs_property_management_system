import type { AuditItemResult } from "./enums";
import type { Item } from "./item";

/**
 * Typed from `backend/src/routes/audits.ts` and the backend's Prisma schema.
 *
 * Gap G1 is closed in both directions now: `GET /audits/:id` reads one session
 * back, and `GET /audits` lists them. Before the list existed, a session id was
 * the only way to reach a stored audit and nothing in the app ever showed one —
 * the rows were saved and simultaneously undiscoverable.
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

/** One stored result row, as `GET /audits/:id` includes it. */
export interface AuditResultRow {
  itemId: string;
  result: AuditItemResult;
  scannedAt: string | null;
  item: {
    tagId: string;
    name: string;
    department: string;
    building: string;
    floor: string;
    room: string;
  };
}

/**
 * One row of `GET /audits` — a session plus the counts the server derives from its
 * stored rows. `completed` is explicit rather than implied by `completedAt`, so a
 * caller never has to know that the timestamp's presence is the flag.
 */
export interface AuditSessionSummary {
  id: string;
  scopeType: string;
  scopeValue: string | null;
  runById: string;
  startedAt: string;
  completedAt: string | null;
  completed: boolean;
  counts: {
    found: number;
    missing: number;
    locationMismatch: number;
  };
  runBy: AuditUserSummary;
}

/**
 * `GET /audits` 200 response. Paginated like every other list in the API
 * (`items`, `requests`, `notifications`): a page of `audits` plus the `total`.
 */
export interface AuditListResponse {
  audits: AuditSessionSummary[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * `GET /audits/:id` 200 response — the read-back that closes gap G1. It carries
 * the same `counts`/id-lists the completion response returns, plus the stored
 * `rows`, so the report survives a reload instead of living only in router
 * state.
 */
export interface AuditSessionReadback {
  id: string;
  scopeType: string;
  scopeValue: string | null;
  runById: string;
  startedAt: string;
  completedAt: string | null;
  completed: boolean;
  counts: {
    found: number;
    missing: number;
    locationMismatch: number;
  };
  found: string[];
  missing: string[];
  locationMismatch: string[];
  rows: AuditResultRow[];
}
