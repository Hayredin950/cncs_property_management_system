import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, markNotificationRead } from "../api/notifications";
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
      // The generic is load-bearing: without it `getQueriesData` yields
      // `[QueryKey, unknown]`, `NonNullable<unknown>` collapses to `{}`, and the
      // optimistic update can't touch `notifications`/`unreadCount`.
      const previous = queryClient.getQueriesData<NotificationsListResponse>({
        queryKey: ["notifications"],
      });
      for (const [key, data] of previous) {
        if (!data) continue;
        const wasUnread = data.notifications.some((n) => n.id === id && !n.isRead);
        queryClient.setQueryData<NotificationsListResponse>(key, {
          ...data,
          notifications: data.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
          unreadCount: Math.max(0, data.unreadCount - (wasUnread ? 1 : 0)),
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["requests", "pending-count"] });
    },
  });
}

export { usePendingCount };
