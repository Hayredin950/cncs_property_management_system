import { useQuery } from "@tanstack/react-query";

/**
 * Fetch active audit session for dashboard widget.
 * Endpoint: GET /audits/active
 */
export function useActiveAudit() {
  return useQuery({
    queryKey: ["audits", "active"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/v1/audits/active", {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch active audit: ${response.statusText}`);
      }
      return response.json();
    },
  });
}

/**
 * Fetch open findings count for dashboard widget.
 * Endpoint: GET /audits/findings?status=OPEN
 */
export function useOpenFindings() {
  return useQuery({
    queryKey: ["audits", "findings"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/v1/audits/findings?status=OPEN", {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch open findings: ${response.statusText}`);
      }
      return response.json();
    },
  });
}

/**
 * Fetch audit history for dashboard widget.
 * Endpoint: GET /audits?dashboard=true&limit=3&sort=completedAt:desc
 */
export function useAuditHistory({ limit }: { limit: number }) {
  return useQuery({
    queryKey: ["audits", "history", limit],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/audits?dashboard=true&limit=${limit}&sort=completedAt:desc`, {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch audit history: ${response.statusText}`);
      }
      return response.json();
    },
  });
}
