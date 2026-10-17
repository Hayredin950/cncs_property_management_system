import { useQuery } from "@tanstack/react-query";
import { fetchPendingCount, fetchRequests } from "../api/requests";
import type { RequestListQuery } from "../types/request";

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

/** "Needs your review" list for dashboard — uses same logic as pending-count (pendingForUser). */
export function usePendingRequests(limit = 5) {
  return useQuery({
    queryKey: ["requests", "pending-review", limit],
    queryFn: ({ signal }) => fetchRequests({ status: "PENDING", limit, window: "none" }, signal),
    staleTime: 30_000,
  });
}
