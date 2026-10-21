import { useQuery } from "@tanstack/react-query";
import { fetchInvitableUnits } from "../api/departments";
import { fetchApprovals, fetchDecidedAccounts, fetchUsers, fetchApprovalsCount } from "../api/users";

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

/** The accounts this viewer has already decided. */
export function useDecidedAccounts(enabled = true) {
  return useQuery({
    queryKey: ["users", "approvals", "decided"],
    queryFn: ({ signal }) => fetchDecidedAccounts(signal),
    enabled,
    staleTime: 15_000,
  });
}

/**
 * `GET /users/approvals/count` — the count of accounts waiting for approval.
 * Used for the Accounts nav badge.
 */
export function useApprovalsCount(enabled = true) {
  return useQuery({
    queryKey: ["users", "approvals", "count"],
    queryFn: ({ signal }) => fetchApprovalsCount(signal),
    enabled,
    staleTime: 15_000,
  });
}

/**
 * `GET /departments/invitable` — the unit picker on the invite form (T6).
 *
 * A unit list changes when the college opens or closes a department, which is
 * rare, so it is cached for longer than the account lists: the picker being one
 * department out of date costs nothing, and refetching it on every invite would
 * not make it more correct.
 */
export function useInvitableUnits(enabled = true) {
  return useQuery({
    queryKey: ["departments", "invitable"],
    queryFn: fetchInvitableUnits,
    enabled,
    staleTime: 5 * 60_000,
  });
}
