import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import {
  clearNotifications,
  dismissNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications";
import type { NotificationsListResponse } from "../types/notification";
import { usePendingCount } from "./useRequests";

/** Inbox query — the unread badge derives from the same response's `unreadCount`. */
export function useNotifications(query: { unread?: boolean; limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: ["notifications", query],
    queryFn: ({ signal }) => fetchNotifications(query, signal),
    placeholderData: (previous) => previous,
  });
}

/**
 * The unread count behind the sidebar's Notifications badge.
 *
 * It reads the inbox endpoint rather than a dedicated `count` route: `unreadCount`
 * is already in the list envelope, already scoped to the caller, and asking for
 * one row is cheap — a separate endpoint would be a second source of truth for a
 * figure the inbox itself renders.
 *
 * Its query key (`limit: 1`) is distinct from the page's (`limit: 50`), which is
 * why every mutation below invalidates `["notifications"]` wholesale: the badge
 * and the list are separate cache entries, and a delete that patched only one of
 * them would leave the two contradicting each other.
 */
export function useUnreadNotificationCount(): number {
  const query = useNotifications({ limit: 1 });
  return query.data?.unreadCount ?? 0;
}

/*
  The four mutations below all rewrite the same cached envelopes, so they share
  these helpers. Each one walks **every** cached `["notifications"]` entry rather
  than a single one, for the reason above.
*/
type NotificationListSnapshot = Array<[QueryKey, NotificationsListResponse | undefined]>;

function snapshotInbox(queryClient: QueryClient): NotificationListSnapshot {
  // The generic is load-bearing: without it `getQueriesData` yields
  // `[QueryKey, unknown]`, `NonNullable<unknown>` collapses to `{}`, and the
  // optimistic update can't touch `notifications`/`unreadCount`.
  return queryClient.getQueriesData<NotificationsListResponse>({ queryKey: ["notifications"] });
}

function patchInbox(
  queryClient: QueryClient,
  snapshot: NotificationListSnapshot,
  update: (data: NotificationsListResponse) => NotificationsListResponse,
) {
  for (const [key, data] of snapshot) {
    if (!data) continue;
    queryClient.setQueryData<NotificationsListResponse>(key, update(data));
  }
}

function restoreInbox(queryClient: QueryClient, snapshot: NotificationListSnapshot | undefined) {
  for (const [key, data] of snapshot ?? []) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * Mark-as-read. Optimistic (§3 "go further"): the row flips immediately and
 * rolls back on failure, so a slow tap doesn't read as a lost click. Also
 * invalidates the pending badge — submission notifications raise it, and the
 * unread counts must agree everywhere.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = snapshotInbox(queryClient);
      patchInbox(queryClient, previous, (data) => {
        const wasUnread = data.notifications.some((n) => n.id === id && !n.isRead);
        return {
          ...data,
          notifications: data.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
          unreadCount: Math.max(0, data.unreadCount - (wasUnread ? 1 : 0)),
        };
      });
      return { previous };
    },
    onError: (_error, _id, context) => restoreInbox(queryClient, context?.previous),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["requests", "pending-count"] });
    },
  });
}

/**
 * Mark every message read at once. Same optimistic shape as the single-row
 * version, but there is nothing to count: every cached row flips and the badge
 * goes to zero in the same tick.
 *
 * The server's `updated` count is deliberately not used to derive anything — the
 * cached list may be a page of a longer inbox, so a client that added `updated`
 * to its own numbers would be guessing. Invalidation replaces both with the
 * server's answer a moment later.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = snapshotInbox(queryClient);
      patchInbox(queryClient, previous, (data) => ({
        ...data,
        notifications: data.notifications.map((n) => (n.isRead ? n : { ...n, isRead: true })),
        unreadCount: 0,
      }));
      return { previous };
    },
    onError: (_error, _variables, context) => restoreInbox(queryClient, context?.previous),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // The inbox can hold the only trace of a raised review count, exactly as
      // the single-row mutation notes.
      void queryClient.invalidateQueries({ queryKey: ["requests", "pending-count"] });
    },
  });
}

/**
 * Dismiss one message (the X on a card).
 *
 * The row leaves the list and the badge drops with it — a dismissal is the one
 * action here that always removes an unread row, so leaving the count alone would
 * be visibly wrong. If the row was already read, the count is untouched.
 */
export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = snapshotInbox(queryClient);
      patchInbox(queryClient, previous, (data) => {
        const dismissed = data.notifications.find((n) => n.id === id && !n.isRead);
        return {
          ...data,
          notifications: data.notifications.filter((n) => n.id !== id),
          unreadCount: Math.max(0, data.unreadCount - (dismissed ? 1 : 0)),
        };
      });
      return { previous };
    },
    onError: (_error, _id, context) => restoreInbox(queryClient, context?.previous),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Clear the whole inbox. Rolled back on failure like the rest — a failed clear
 * must not leave the reader believing an empty inbox is the server's state.
 */
export function useClearNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearNotifications,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = snapshotInbox(queryClient);
      patchInbox(queryClient, previous, (data) => ({ ...data, notifications: [], unreadCount: 0 }));
      return { previous };
    },
    onError: (_error, _variables, context) => restoreInbox(queryClient, context?.previous),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export { usePendingCount };
