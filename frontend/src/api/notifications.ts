import { apiClient } from "../lib/apiClient";
import type { MarkReadResponse, NotificationsListResponse } from "../types/notification";

/**
 * `GET /notifications` — own inbox only; `?unread=true` filters. The server
 * splits its stored `[CODE] text` form so `code` is directly usable by the UI.
 */
export function fetchNotifications(
  query: { unread?: boolean; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationsListResponse> {
  return apiClient.get<NotificationsListResponse>(
    "/notifications",
    { ...(query.unread ? { unread: "true" } : {}), limit: query.limit, offset: query.offset },
    signal,
  );
}

/**
 * `POST /notifications/:id/read` — scoped by userId server-side (IDOR-safe).
 * Unknown or not-yours ids answer 404 with no existence leak.
 */
export function markNotificationRead(id: string): Promise<MarkReadResponse> {
  return apiClient.post<MarkReadResponse>(`/notifications/${encodeURIComponent(id)}/read`);
}
