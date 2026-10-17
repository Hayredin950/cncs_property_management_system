import type { AuditItemResult, AuditSessionStatus } from "./enums";
import type { Item } from "./item";

/**
 * Typed from `backend/src/routes/audits.ts` and the backend's Prisma schema.
 */

/** One nested user reference, as the creation response selects it. */
export interface AuditUserSummary {
  id: string;
  fullName: string;
  email: string;
}

export interface AuditSession {
  id: string;
  status: AuditSessionStatus;
  reportNumber?: string | null;
  scopeType: string;
  scopeValue: string | null;
  snapshotTotalCount?: number;
  excludedAuditorCount?: number;
  runById: string;
  startedAt: string;
  completedAt: string | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: AuditUserSummary | null;
  runBy: AuditUserSummary;
}

/** Body of `POST /audits`. */
export interface CreateAuditPayload {
  scopeType: string;
  scopeValue?: string | null;
}

/** Body of `POST /audits/:id/sort-item`. */
export interface SortAuditItemPayload {
  itemId: string;
  result: "NOT_ACCESSIBLE" | "CHECK_AGAIN" | "MISSING";
  sortReason: string;
  sortNote?: string | null;
  checkAgainDays?: number | null;
}

export interface AuditScanRow {
  id: string;
  auditSessionId: string;
  itemId: string;
  result: AuditItemResult;
  scannedAt: string | null;
  item: Item;
}

export interface ScannedAuditItem {
  itemId: string;
  tagId: string;
  name: string;
  room: string;
  scannedAt: string;
}

export interface AuditWalkthroughState {
  scopeValue: string;
  scanned: ScannedAuditItem[];
}

export interface AuditCompletionResponse {
  auditSessionId: string;
  completedAt: string;
  counts: {
    found: number;
    missing: number;
    locationMismatch: number;
    notLocated?: number;
    notAccessible?: number;
    checkAgain?: number;
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
  sortReason?: string | null;
  sortNote?: string | null;
  checkAgainDays?: number | null;
  item: {
    tagId: string;
    name: string;
    department: string;
    building: string;
    floor: string;
    room: string;
  };
}

export interface AuditCounts {
  found: number;
  missing: number;
  locationMismatch: number;
  notLocated?: number;
  notAccessible?: number;
  checkAgain?: number;
  pending?: number;
}

export interface AuditSessionSummary {
  id: string;
  status?: AuditSessionStatus;
  reportNumber?: string | null;
  scopeType: string;
  scopeValue: string | null;
  snapshotTotalCount?: number;
  excludedAuditorCount?: number;
  runById: string;
  startedAt: string;
  completedAt: string | null;
  completed: boolean;
  acknowledgedAt?: string | null;
  acknowledgedBy?: AuditUserSummary | null;
  counts: AuditCounts;
  runBy: AuditUserSummary;
}

export interface AuditListResponse {
  audits: AuditSessionSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditSessionReadback {
  id: string;
  status: AuditSessionStatus;
  reportNumber?: string | null;
  scopeType: string;
  scopeValue: string | null;
  runById: string;
  runBy: AuditUserSummary;
  startedAt: string;
  completedAt: string | null;
  completed: boolean;
  snapshotTotalCount?: number;
  excludedAuditorCount?: number;
  acknowledgedAt?: string | null;
  acknowledgedById?: string | null;
  acknowledgedBy?: AuditUserSummary | null;
  frozenReport?: any;
  counts: AuditCounts;
  found: string[];
  missing: string[];
  locationMismatch: string[];
  notLocated?: string[];
  notAccessible?: string[];
  checkAgain?: string[];
  pending?: string[];
  rows: AuditResultRow[];
}
