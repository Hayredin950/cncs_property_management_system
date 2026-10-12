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
