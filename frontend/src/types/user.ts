import type { Role } from "./enums";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  createdAt: string;
  /**
   * Set when an administrator reset this account's password. The app forces a
   * change on the next sign-in (`RequireAuth` redirects to `/change-password`).
   * Absent on responses from before the reset flow existed, hence optional.
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
