import { apiClient } from "../lib/apiClient";
import type {
  ClearNotificationsResponse,
  DismissNotificationResponse,
  MarkAllReadResponse,
  MarkReadResponse,
  NotificationsListResponse,
} from "../types/notification";

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

/**
 * `POST /notifications/read-all` — the caller's whole inbox, one request.
 *
 * A literal path, deliberately: it sits beside `/:id/read` on purpose (the router
 * resolves the literal first), and the response's `updated` count is the server's
 * own number of rows that changed — the client never assumes its cached list was
 * complete, which matters when the inbox is paginated at 50.
 */
export function markAllNotificationsRead(): Promise<MarkAllReadResponse> {
  return apiClient.post<MarkAllReadResponse>("/notifications/read-all");
}

/**
 * `DELETE /notifications/:id` — dismiss one message.
 *
 * Hard delete, scoped to the caller's own inbox server-side. Removing a
 * notification destroys no register record: the request, edit-log row or audit
 * result it was copied from is untouched (see backend-handoff.md).
 */
export function dismissNotification(id: string): Promise<DismissNotificationResponse> {
  return apiClient.delete<DismissNotificationResponse>(`/notifications/${encodeURIComponent(id)}`);
}

/** `DELETE /notifications` — empty the caller's inbox; idempotent, reports how many went. */
export function clearNotifications(): Promise<ClearNotificationsResponse> {
  return apiClient.delete<ClearNotificationsResponse>("/notifications");
}
