import type { AccountStatus, InvitableRole, Role } from "./enums";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  createdAt: string;
  /** The user's department ID — present for DEPARTMENT_HEAD and STAFF roles. */
  departmentId?: string;
  /**
   * Legacy rollback bridge. No route sets it any more (an administrator cannot
   * set a password, C10), but a row that still has it set — left by an older
   * build — is forced through `/change-password` on sign-in rather than carrying
   * a temporary password forward.
   */
  mustChangePassword?: boolean;
}

/**
 * An account as the admin screen sees it (`GET /users`): the same fields as
 * `AuthUser` plus how many items it owns, so the list can show whether an
 * account is part of the record before an administrator tries to remove it.
 */
export interface UserSummary extends AuthUser {
  itemCount: number;
  /**
   * The account lifecycle (spec 3.1.2). Only `ACTIVE` accounts can sign in, and a
   * `PENDING_APPROVAL` one is what the approval queue is made of.
   */
  accountStatus: AccountStatus;
  /** When an administrator decided it, or null for a row nobody had to review. */
  reviewedAt: string | null;
  /** The rejection reason, shown next to a declined row. */
  reviewNote: string | null;
}

/**
 * `POST /auth/account-requests` — what a person gets back after asking for an
 * account. Deliberately not a user object: there is no session, no role to render,
 * and the only thing to show is that the request is in and who to ask.
 */
export interface AccountRequestResponse {
  message: string;
  request: {
    id: string;
    fullName: string;
    email: string;
    accountStatus: AccountStatus;
    requestedAt: string;
  };
}

/**
 * `POST /auth/login` also returns the user flattened at the top level (`id`,
 * `name`, `fullName`, ...) alongside `token` and the nested `user` object below.
 * The client reads only the nested form (frontend-plan.md §4) — model just that.
 */
export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * `POST /users/invite` — what an administrator gets back after issuing a
 * privileged invitation (T6).
 *
 * `inviteUrl` is the single-use link, and `email` says whether it was also sent:
 * the transport reports `skipped` while no mail server is configured, which is
 * when the administrator has to pass the link on themselves. `renewed` says
 * whether this replaced a previous invitation that expired unaccepted.
 */
export interface InviteAccountResponse {
  invite: {
    userId: string;
    email: string;
    role: InvitableRole;
    unitId: string | null;
    status: AccountStatus;
    expiresAt: string;
    renewed: boolean;
  };
  inviteUrl: string;
  email: "sent" | "skipped" | "failed";
}

/**
 * Department option from `GET /departments`.
 */
export interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

/** What became of an invitation (`GET /users/invites`). */
export type InviteStatus = "SENT" | "RESENT" | "EXPIRED" | "ACCEPTED";

/**
 * One row of the administrator's invitation list.
 *
 * `id` is the account's id, which is what the resend and revoke routes take;
 * `tokenId` is the single-use token behind it. Accepted rows stay in the list
 * so "who did we invite, and what became of it?" has one answer.
 */
export interface InviteRow {
  id: string;
  tokenId: string;
  fullName: string;
  email: string;
  role: Role;
  orgUnitId: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  authorizedBy: string | null;
  authorizationRef: string | null;
  status: InviteStatus;
}
