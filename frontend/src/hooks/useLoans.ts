import { useQuery } from "@tanstack/react-query";

/**
 * Fetch overdue loans count for dashboard widget.
 * Endpoint: GET /loans/overdue
 */
export function useOverdueLoans() {
  return useQuery({
    queryKey: ["loans", "overdue"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/v1/loans/overdue", {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch overdue loans: ${response.statusText}`);
      }
      return response.json();
    },
  });
}
