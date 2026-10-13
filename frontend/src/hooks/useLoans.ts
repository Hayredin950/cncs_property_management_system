import { useQuery } from "@tanstack/react-query";

/**
 * Fetch overdue loans count for the dashboard widget.
 * Endpoint: GET /loans/overdue
 * Falls back gracefully if endpoint doesn't exist yet.
 */
export function useOverdueLoans() {
  return useQuery({
    queryKey: ["loans", "overdue"],
    queryFn: async ({ signal }) => {
      try {
        const response = await fetch("/api/v1/loans/overdue", {
          signal,
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          // Endpoint doesn't exist yet - return zero count gracefully
          if (response.status === 404) {
            return { count: 0 };
          }
          throw new Error(`Failed to fetch overdue loans: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        // If fetch fails, return zero count gracefully
        console.error("Failed to fetch overdue loans:", error);
        return { count: 0 };
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
