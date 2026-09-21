import type { ItemStatus, RequestStatus, RequestType } from "./enums";

/**
 * Hand-mirrored from `backend/src/routes/requests.ts` and
 * docs/frontend-plan.md §4's envelope table. Note the envelope differs between
 * `GET /requests` (`{ requests, total, limit, offset }`) and `GET /items`
 * (`{ data, pagination }`) — a real inconsistency in the built API the plan
 * calls out, so each gets its own type rather than a generic `Paginated<T>`.
 */

export interface RequestItemSummary {
  id: string;
  tagId: string;
  name: string;
  status: ItemStatus;
}

export interface RequestUserSummary {
  id: string;
  fullName: string;
  email: string;
}

export interface RequestSummary {
  id: string;
  type: RequestType;
  status: RequestStatus;
  reason: string;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  newLocationBuilding: string | null;
  newLocationFloor: string | null;
  newLocationRoom: string | null;
  newOwnerId: string | null;
  requestedById: string;
  reviewedById: string | null;
  item: RequestItemSummary;
  requestedBy: RequestUserSummary;
}

export interface RequestsListResponse {
  requests: RequestSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface RequestsListQuery {
  status?: RequestStatus;
  type?: RequestType;
  /** Admin-only filter (`?mine=true`) to narrow to the caller's own filings. */
  mine?: boolean;
  limit?: number;
  offset?: number;
}

/** `GET /requests/pending-count` — the lightweight badge endpoint (SRS F8.2). */
export interface PendingCountResponse {
  pendingCount: number;
}
