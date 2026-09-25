import type { NotificationCode } from "./enums";

/**
 * Modeled from `GET /notifications` in `backend/src/routes/notifications.ts`:
 * the server splits its stored `[CODE] text` form and never leaks the prefix —
 * `code` is what the UI branches icon/colour on (frontend-plan.md §7). An
 * unknown or absent code still renders its `message` (the design doc's §3.2
 * map is a lookup, never an exhaustive switch).
 */
export interface AppNotification {
  id: string;
  code: NotificationCode | null;
  message: string;
  relatedRequestId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** `GET /notifications` envelope — bare `unreadCount`, not a `pagination` object. */
export interface NotificationsListResponse {
  notifications: AppNotification[];
  unreadCount: number;
  limit: number;
  offset: number;
}

/** `POST /notifications/:id/read` response. */
export interface MarkReadResponse {
  id: string;
  isRead: boolean;
}

/**
 * `POST /notifications/read-all` response. `updated` counts the rows that
 * actually flipped, so 0 means "nothing was unread", not "the call failed" — the
 * endpoint is idempotent and a retry is always safe.
 */
export interface MarkAllReadResponse {
  updated: number;
}

/** `DELETE /notifications/:id` response — one dismissed message. */
export interface DismissNotificationResponse {
  id: string;
  deleted: true;
}

/** `DELETE /notifications` response — how many rows left the inbox. */
export interface ClearNotificationsResponse {
  deleted: number;
}
