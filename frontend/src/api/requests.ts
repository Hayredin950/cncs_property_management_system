import { apiClient } from "../lib/apiClient";
import type { PendingCountResponse, RequestsListQuery, RequestsListResponse } from "../types/request";

/**
 * `GET /requests` — Staff/Admin. Staff see their own filings, admins see the
 * review queue (the backend scopes by role). Filters are server-side
 * (`status`/`type`/`mine`), never filtered again on the client.
 */
export function fetchRequests(
  query: RequestsListQuery = {},
  signal?: AbortSignal,
): Promise<RequestsListResponse> {
  const { status, type, mine, limit, offset } = query;
  return apiClient.get<RequestsListResponse>(
    "/requests",
    { status, type, mine, limit, offset },
    signal,
  );
}

/** `GET /requests/pending-count` — admin badge. Cheap enough to poll. */
export function fetchPendingCount(signal?: AbortSignal): Promise<PendingCountResponse> {
  return apiClient.get<PendingCountResponse>("/requests/pending-count", undefined, signal);
}
