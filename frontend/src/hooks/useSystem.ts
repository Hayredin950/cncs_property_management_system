import { useQuery } from "@tanstack/react-query";

/**
 * Fetch system status for dashboard widget.
 * Endpoint: GET /system/status
 * Falls back gracefully if endpoint doesn't exist yet.
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: ["system", "status"],
    queryFn: async ({ signal }) => {
      try {
        const response = await fetch("/api/v1/system/status", {
          signal,
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          // Endpoint doesn't exist yet - return default values gracefully
          if (response.status === 404) {
            return {
              environment: "Unknown",
              lastDeploy: "Unknown",
              uptime: "Unknown",
            };
          }
          throw new Error(`Failed to fetch system status: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        // If fetch fails, return default values gracefully
        console.error("Failed to fetch system status:", error);
        return {
          environment: "Unknown",
          lastDeploy: "Unknown",
          uptime: "Unknown",
        };
      }
    },
    // Don't retry on 404 - endpoint might not exist yet
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes("404")) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

/**
 * Fetch recent system events for dashboard widget.
 * Endpoint: GET /system/events?limit=10
 * Falls back gracefully if endpoint doesn't exist yet.
 */
export function useRecentSystemEvents() {
  return useQuery({
    queryKey: ["system", "events"],
    queryFn: async ({ signal }) => {
      try {
        const response = await fetch("/api/v1/system/events?limit=10", {
          signal,
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          // Endpoint doesn't exist yet - return empty array gracefully
          if (response.status === 404) {
            return [];
          }
          throw new Error(`Failed to fetch system events: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        // If fetch fails, return empty array gracefully
        console.error("Failed to fetch system events:", error);
        return [];
      }
    },
    // Don't retry on 404 - endpoint might not exist yet
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes("404")) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
