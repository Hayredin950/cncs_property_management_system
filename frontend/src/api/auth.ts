import { apiClient } from "../lib/apiClient";
import type { LoginRequest, LoginResponse, MeResponse, AuthUser } from "../types/user";

/** `POST /auth/login` — public. See types/user.ts for why only `.user` is read back out. */
export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/auth/login", payload);
}

/** `GET /auth/me` — rehydrates a stored token into a user on boot. */
export function fetchCurrentUser(signal?: AbortSignal): Promise<MeResponse> {
  return apiClient.get<MeResponse>("/auth/me", undefined, signal);
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/**
 * `POST /auth/change-password` — the signed-in account changes its own password.
 *
 * The response is a fresh login payload: the server bumps the account's
 * `tokenVersion` (revoking every other session) and returns a new token so this
 * device stays signed in.
 */
export function changePassword(payload: ChangePasswordPayload): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/auth/change-password", payload);
}

/** Body of `POST /auth/register` — Admin-only account creation (F1.3). */
export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  role: "ADMIN" | "STAFF";
}

/**
 * `POST /auth/register` — creates the account and returns the created user.
 * A duplicate email answers 409. **There is no user list/update/delete
 * endpoint** (gap G2, frontend-plan.md §12) — the screen can create, nothing
 * more, and says so rather than pretending.
 */
export function registerUser(payload: RegisterPayload): Promise<{ user: AuthUser }> {
  return apiClient.post<{ user: AuthUser }>("/auth/register", payload);
}
