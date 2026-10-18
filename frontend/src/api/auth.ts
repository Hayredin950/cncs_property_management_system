import { apiClient } from "../lib/apiClient";
import type {
  AccountRequestResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
} from "../types/user";

/** `POST /auth/login` — public. See types/user.ts for why only `.user` is read back out. */
export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/auth/login", payload);
}

export interface AccountRequestPayload {
  fullName: string;
  email: string;
  password: string;
  staffId?: string;
  department?: string;
}

/**
 * `POST /auth/register` (or `/auth/account-requests`) — public staff self-registration.
 * Sets account to PENDING_EMAIL_VERIFICATION and dispatches verification email.
 */
export function requestAccount(payload: AccountRequestPayload): Promise<AccountRequestResponse> {
  return apiClient.post<AccountRequestResponse>("/auth/register", payload);
}

/**
 * `POST /auth/verify-email` — validates email token and transitions account to PENDING_APPROVAL.
 */
export function verifyEmail(token: string): Promise<{ message: string; status: string; email: string }> {
  return apiClient.post<{ message: string; status: string; email: string }>("/auth/verify-email", { token });
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }>("/auth/request-password-reset", { email });
}

export function resetPassword(payload: { token: string; password: string }): Promise<{ message: string }> {
  return apiClient.post<{ message: string }>("/auth/reset-password", payload);
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

/**
 * `POST /auth/accept-invite` — the invited person chooses their own password (T6).
 *
 * Public, because the whole point is that they do not have an account yet: the
 * account an administrator invited exists as `PENDING_EMAIL_VERIFICATION` with a
 * password nobody knows — including the administrator, who is never allowed to
 * set one. The token from the invite link is the credential.
 *
 * On success it returns the same `{ token, user }` shape as `POST /auth/login`: the
 * invitee is signed in on this device rather than asked to type the password they
 * just chose.
 */
export function acceptInvite(payload: {
  token: string;
  password: string;
  /** Their own name — the invitation names an email and a post, not a person. */
  fullName?: string | undefined;
}): Promise<LoginResponse & { headedUnitId: string | null }> {
  return apiClient.post<LoginResponse & { headedUnitId: string | null }>(
    "/auth/accept-invite",
    payload,
  );
}
