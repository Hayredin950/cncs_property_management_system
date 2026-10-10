import type { ItemStatus, RequestStatus, RequestType } from "./enums";

/**
 * Modeled from `REQUEST_LIST_SELECT` / `REQUEST_DETAIL_SELECT` in
 * `backend/src/routes/requests.ts` — the two endpoint shapes are deliberately
 * separate types (frontend-plan.md §4: model each response with its own type
 * rather than assuming a shared envelope). Nullable columns are `| null`,
 * never `?`: Prisma returns the key with `null`, it does not omit it.
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

/** The list endpoint's item select — id/tagId/name/status only. */
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

/**
 * The detail endpoint adds `reviewedBy` and a richer item row (location
 * fields + parentItemId) via `REQUEST_DETAIL_SELECT`.
 */
export interface RequestDetailItem extends RequestItemSummary {
  department: string;
  building: string;
  floor: string;
  room: string;
  parentItemId: string | null;
}

export interface RequestDetail extends Omit<RequestSummary, "item"> {
  item: RequestDetailItem;
  reviewedBy: RequestUserSummary | null;
}

/**
 * `GET /requests` uses a bare `total`/`limit`/`offset` envelope — deliberately
 * *not* the `pagination` object `GET /items` returns. Two different pagination
 * key-names across two endpoints is a real inconsistency in the built API
 * (frontend-plan.md §4), so each response carries its own type.
 */
export interface RequestsListResponse {
  requests: RequestSummary[];
  total: number;
  limit: number;
  offset: number;
}

/** `GET /requests/:id` envelope. */
export interface RequestByIdResponse {
  request: RequestDetail;
}

/** `POST /requests` body — TRANSFER names a location and/or owner; DISPOSAL names neither (server 400s otherwise). */
export interface CreateRequestPayload {
  type: RequestType;
  itemId: string;
  reason: string;
  newLocationBuilding?: string;
  newLocationFloor?: string;
  newLocationRoom?: string;
  newOwnerId?: string;
}

export interface CreateRequestResponse {
  request: RequestSummary;
  notifiedReviewerCount: number;
  emailStatus: string;
}

/**
 * `POST /requests/:id/approve` / `/reject` — the decision response carries the
 * applied item changes and cascade info so the UI can state what happened.
 * `itemChanges` is server-shaped (see `applyDecision`); the UI displays a
 * count, never re-interprets the diff.
 */
export interface DecideRequestResponse {
  request: {
    id: string;
    type: RequestType;
    status: RequestStatus;
    decidedAt: string;
    item: RequestItemSummary;
    requestedBy: RequestUserSummary;
    reviewedBy: RequestUserSummary;
    rejectionReason?: string;
  };
  itemChanges: Record<string, unknown>;
  cascadedItemIds: string[];
  editLogRowCount: number;
  notification: { code: NotificationCodeOf; message: string };
  emailStatus: string;
}

/** Kept local: the code enum lives in enums.ts; alias avoids a second import here. */
type NotificationCodeOf = import("./enums").NotificationCode;

export interface RequestListQuery {
  status?: RequestStatus;
  type?: RequestType;
  mine?: boolean;
  limit?: number;
  offset?: number;
}

/** `GET /requests/pending-count` — the admin review-queue badge. */
export interface PendingCountResponse {
  pendingCount: number;
}
