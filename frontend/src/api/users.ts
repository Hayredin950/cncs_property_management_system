import { apiClient } from "../lib/apiClient";
import type { UserSummary } from "../types/user";

/**
 * `GET /users` — **Admin only.** Every account, with the number of items it
 * owns. The server enforces the role, so a staff-side render would be a UI bug,
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
 * `POST /users/:id/promote` — STAFF → ADMIN.
 *
 * There is deliberately no demote counterpart: a promote grants access, a
 * demote silently strips it, and the API only offers the safe direction.
 */
export function promoteUser(id: string): Promise<UserSummary> {
  return apiClient.post<UserSummary>(`/users/${encodeURIComponent(id)}/promote`, {});
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
