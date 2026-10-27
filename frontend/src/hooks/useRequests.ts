import { useQuery } from "@tanstack/react-query";
import { fetchPendingCount, fetchRequests } from "../api/requests";
import type { RequestListQuery, RequestStatusFilter } from "../types/request";

export function useRequests(query: RequestListQuery) {
  return useQuery({
    queryKey: ["requests", query],
    queryFn: ({ signal }) => fetchRequests(query, signal),
    placeholderData: (previous) => previous,
  });
}

/** The pending-count badge (frontend-plan.md §7). */
export function usePendingCount() {
  return useQuery({
    queryKey: ["requests", "pending-count"],
    queryFn: ({ signal }) => fetchPendingCount(signal),
    staleTime: 30_000,
  });
}

/**
 * "Needs your review" list for the dashboard.
 *
 * `status` comes from `reviewQueueStatuses(role)` — the same set
 * `GET /requests/pending-count` counts — so the preview cannot sit empty under
 * a non-zero tile. Disabled when the viewer has no queue, rather than fetching
 * a list the dashboard will not render.
 */
export function usePendingRequests(status: RequestStatusFilter | undefined, limit = 5) {
  return useQuery({
    queryKey: ["requests", "pending-review", status, limit],
    queryFn: ({ signal }) =>
      fetchRequests({ ...(status ? { status } : {}), limit, window: "none" }, signal),
    enabled: Boolean(status),
    staleTime: 30_000,
  });
}
