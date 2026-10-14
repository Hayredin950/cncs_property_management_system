import { useQuery } from "@tanstack/react-query";

/**
 * Fetch system status for dashboard widget.
 * Endpoint: GET /admin/system/status
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: ["system", "status"],
    queryFn: async ({ signal }) => {
      const response = fetch("/api/v1/admin/system/status", {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch system status: ${response.statusText}`);
      }
      return response.json();
    },
  });
}

/**
 * Fetch recent system events for dashboard widget.
 * Endpoint: GET /admin/system/events?limit=10
 */
export function useRecentSystemEvents() {
  return useQuery({
    queryKey: ["system", "events"],
    queryFn: async ({ signal }) => {
      const response = fetch("/api/v1/admin/system/events?limit=10", {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch system events: ${response.statusText}`);
      }
      return response.json();
    },
  });
}
