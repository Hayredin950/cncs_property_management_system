import { useQuery } from "@tanstack/react-query";
import { fetchPendingCount, fetchRequests } from "../api/requests";
import type { RequestsListQuery } from "../types/request";

export function useRequests(query: RequestsListQuery) {
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
