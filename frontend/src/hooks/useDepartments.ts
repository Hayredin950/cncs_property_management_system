import { useQuery } from "@tanstack/react-query";

/**
 * Fetch department roster snapshot for dashboard widget.
 * Endpoint: GET /departments/:id/roster
 * Falls back gracefully if endpoint doesn't exist yet.
 */
export function useDepartmentRoster() {
  return useQuery({
    queryKey: ["departments", "roster"],
    queryFn: async ({ signal }) => {
      try {
        const response = await fetch("/api/v1/departments/roster", {
          signal,
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          // Endpoint doesn't exist yet - return zero count gracefully
          if (response.status === 404) {
            return { staffCount: 0 };
          }
          throw new Error(`Failed to fetch department roster: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        // If fetch fails, return zero count gracefully
        console.error("Failed to fetch department roster:", error);
        return { staffCount: 0 };
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
