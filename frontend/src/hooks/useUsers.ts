import { useQuery } from "@tanstack/react-query";
import { fetchApprovals, fetchUsers } from "../api/users";

/**
 * `GET /users` — Admin only. The admin screen is the only caller; `enabled`
 * lets a non-admin mount the component without firing a request that would only
 * come back 403 (RequireAuth already turns such a deep-link into a 404, so this
 * is belt-and-braces).
 */
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ["users"],
    queryFn: ({ signal }) => fetchUsers(signal),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * `GET /users/approvals` — the accounts waiting for a decision, oldest first.
 *
 * Needs `ACCOUNT_MANAGE` (System Admin only). Same `enabled` belt-and-braces as
 * `useUsers`: a non-admin mount must not fire a request that can only 403.
 */
export function useApprovals(enabled = true) {
  return useQuery({
    queryKey: ["users", "approvals"],
    queryFn: ({ signal }) => fetchApprovals(signal),
    enabled,
    staleTime: 15_000,
  });
}
