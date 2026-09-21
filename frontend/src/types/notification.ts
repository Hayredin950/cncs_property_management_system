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
