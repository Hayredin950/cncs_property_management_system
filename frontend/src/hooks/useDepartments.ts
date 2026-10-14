import { useQuery } from "@tanstack/react-query";

/**
 * Fetch department roster snapshot for dashboard widget.
 * Endpoint: GET /departments/:id/roster
 * For Department Head, uses their own orgUnitId.
 */
export function useDepartmentRoster({ departmentId }: { departmentId: string | null }) {
  return useQuery({
    queryKey: ["departments", "roster", departmentId],
    queryFn: async ({ signal }) => {
      if (!departmentId) {
        return null;
      }
      const response = await fetch(`/api/v1/departments/${departmentId}/roster`, {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch department roster: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!departmentId,
  });
}
