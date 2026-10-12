import { apiClient } from "../lib/apiClient";
import type { Role } from "../types/enums";
import type { UserSummary } from "../types/user";

/**
 * `GET /users` — requires `USER_READ` (spec 2.1.1): the System Admin and the
 * Property Officer hold it. Every account, with the number of items it owns. The
 * server enforces the capability, so a render by anyone else would be a UI bug,
 * not a way in.
 */
export function fetchUsers(signal?: AbortSignal): Promise<UserSummary[]> {
  return apiClient.get<UserSummary[]>("/users", undefined, signal);
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
}

/**
 * `GET /users/approvals` — the accounts waiting for a decision, oldest first.
 *
 * Requires `ACCOUNT_MANAGE`, which is more than `GET /users` needs: the account list
 * fills the custodian picker, while the queue is the list of people waiting to join,
 * and who is waiting is the System Admin's business alone.
 */
export function fetchApprovals(signal?: AbortSignal): Promise<UserSummary[]> {
  return apiClient.get<UserSummary[]>("/users/approvals", undefined, signal);
}

/**
 * `POST /users/:id/approve` — let the account sign in.
 *
 * `role` is the real role, assigned at approval time: the request itself always asks
 * as STAFF, because a person must not be able to choose their own privileges. Omit
 * it to keep the role the request already carries.
 *
 * The server refuses an administrator approving **their own** account with 403 — the
 * rule lives there, not in this client.
 */
export function approveUser(id: string, role?: Role): Promise<UserSummary> {
  return apiClient.post<UserSummary>(`/users/${encodeURIComponent(id)}/approve`, role ? { role } : {});
}

/**
 * `POST /users/:id/reject` — decline the request with a reason the person will read.
 * The reason is required (3–500 characters), same as a request rejection (F6.2).
 */
export function rejectUser(id: string, reason: string): Promise<UserSummary> {
  return apiClient.post<UserSummary>(`/users/${encodeURIComponent(id)}/reject`, { reason });
}

/** `PATCH /users/:id` — correct a name or email. A taken email answers 409. */
export function updateUser(id: string, payload: UpdateUserPayload): Promise<UserSummary> {
  return apiClient.patch<UserSummary>(`/users/${encodeURIComponent(id)}`, payload);
}

/**
 * `POST /users/:id/promote` — set an account's role (any of the five, spec 2.1).
 *
 * One operation rather than promote/demote pairs, and the endpoint is named
 * `promote` for the direction that was originally the only one. The server bumps
 * the account's `tokenVersion`, so the role change takes effect on the next
 * request instead of whenever the old token happens to expire (gap-analysis E10).
 */
export function promoteUser(id: string, role: Role): Promise<UserSummary> {
  return apiClient.post<UserSummary>(`/users/${encodeURIComponent(id)}/promote`, { role });
}

/** `POST /users/:id/password` — set a new password for the account. */
export function resetUserPassword(
  id: string,
  password: string,
): Promise<{ id: string; passwordChanged: boolean }> {
  return apiClient.post<{ id: string; passwordChanged: boolean }>(
    `/users/${encodeURIComponent(id)}/password`,
    { password },
  );
}

/**
 * `DELETE /users/:id` — **Admin only**, and refused for any account that is part
 * of the record (owns items, filed/reviewed requests, ran audits, made edits).
 * Those relations would block the delete at the database level regardless, so
 * the API reports what stands in the way instead.
 */
export function deleteUser(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete<{ id: string; deleted: boolean }>(`/users/${encodeURIComponent(id)}`);
}
