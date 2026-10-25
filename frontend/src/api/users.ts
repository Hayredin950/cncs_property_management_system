import { apiClient } from "../lib/apiClient";
import type { InvitableRole, Role } from "../types/enums";
import type { InviteAccountResponse, InviteRow, UserSummary } from "../types/user";

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
 * The accounts this viewer has already decided.
 *
 * The queue empties itself as the work gets done, so without this the only
 * trace of a decision is the notification that went out with it.
 */
export function fetchDecidedAccounts(signal?: AbortSignal): Promise<UserSummary[]> {
  return apiClient.get<UserSummary[]>("/users/approvals", { decided: "true" }, signal);
}

/**
 * `GET /users/approvals/count` — count of accounts waiting for approval.
 * Used for the Accounts nav badge.
 */
export function fetchApprovalsCount(signal?: AbortSignal): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>("/users/approvals/count", undefined, signal);
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

export interface InviteUserPayload {
  email: string;
  role: InvitableRole;
  /**
   * Required when the role is DEPARTMENT_HEAD: one head per unit. `| undefined`
   * is spelled out for `exactOptionalPropertyTypes` (see `components/Input.tsx`)
   * so an optional value can be forwarded without a cast.
   */
  unitId?: string | null | undefined;
  /** Who authorized this appointment outside the system (D3). Required. */
  authorizedBy: string;
  /** The letter number or equivalent (D3). Required. */
  authorizationRef: string;
  authorizationNote?: string | null | undefined;
}

/**
 * `POST /users/invite` — create a privileged account by invitation (T6).
 *
 * **There is no password in this payload, and that is the point.** The account is
 * created `PENDING_EMAIL_VERIFICATION` with a password nobody knows, and the
 * invitee chooses their own through `/accept-invite`. An administrator supplying
 * a password here would be the legacy flow this endpoint replaces.
 *
 * The response carries the single-use link as well as the email result, so an
 * administrator can hand it over directly while the mail transport is still a
 * stub — an invitation that cannot be delivered is an invitation that was not
 * sent.
 */
export function inviteUser(payload: InviteUserPayload): Promise<InviteAccountResponse> {
  return apiClient.post<InviteAccountResponse>("/users/invite", payload);
}

/**
 * `POST /users/invites/:id/resend` — issue a **new** invitation link for an
 * account that has not accepted its invitation yet (T8).
 *
 * The old token is deleted and a new one created, so a link that leaked cannot
 * be used after a resend. The account row is reused — a lapsed invitation is
 * not a duplicate account.
 */
export function resendInvite(id: string): Promise<{ message: string; expiresAt: string }> {
  return apiClient.post<{ message: string; expiresAt: string }>(
    `/users/invites/${encodeURIComponent(id)}/resend`,
  );
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

/**
 * `DELETE /users/:id` — **Admin only**, and refused for any account that is part
 * of the record (owns items, filed/reviewed requests, ran audits, made edits).
 * Those relations would block the delete at the database level regardless, so
 * the API reports what stands in the way instead.
 */
export function deleteUser(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete<{ id: string; deleted: boolean }>(`/users/${encodeURIComponent(id)}`);
}

/**
 * `POST /users/:id/deactivate` — close an account.
 *
 * Not a delete: the account stays, it simply cannot sign in again, and the
 * items it held move to `REVERTED_UNVERIFIED` for the department head to
 * verify one by one. The reason is required — it is written to the account's
 * record.
 */
export function deactivateUser(
  id: string,
  reason: string,
): Promise<{ message: string }> {
  return apiClient.post(`/users/${encodeURIComponent(id)}/deactivate`, { reason });
}

/**
 * `POST /users/org-units/:id/activate-head` — appoint a department's head.
 *
 * The handover: the unit's held items move to `REVERTED_UNVERIFIED` and the
 * new head verifies them one by one. The items the *previous* head held
 * personally are not moved to the new head — a role change never moves personal
 * custody.
 */
export function activateDepartmentHead(
  orgUnitId: string,
  newHeadId: string,
): Promise<{ message?: string }> {
  return apiClient.post(`/users/org-units/${encodeURIComponent(orgUnitId)}/activate-head`, {
    newHeadId,
  });
}

/**
 * `GET /users/invites` — every invitation and what became of it (T8).
 *
 * Includes accepted invitations on purpose: a list of only the outstanding
 * ones cannot tell an administrator whether the person they invited ever took
 * the link up.
 */
export function fetchInvites(signal?: AbortSignal): Promise<InviteRow[]> {
  return apiClient.get<InviteRow[]>("/users/invites", undefined, signal);
}

/** `DELETE /users/invites/:id` — revoke an invitation that has not been accepted. */
export function revokeInvite(id: string): Promise<{ message: string }> {
  return apiClient.delete<{ message: string }>(
    `/users/invites/${encodeURIComponent(id)}`,
  );
}
