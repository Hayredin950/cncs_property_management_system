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

/** Body of `POST /auth/account-requests` — asking for an account (spec 3.1.2). */
export interface AccountRequestPayload {
  fullName: string;
  email: string;
  password: string;
}

/**
 * `POST /auth/account-requests` — public: anyone may ask, and nobody gets in by
 * asking. The response carries no token, because the account is `PENDING_APPROVAL`
 * and cannot sign in until a SYSTEM_ADMIN decides it from the queue.
 *
 * There is no `role` field on purpose: the request always lands as STAFF, and the
 * approver assigns the real role.
 */
export function requestAccount(payload: AccountRequestPayload): Promise<AccountRequestResponse> {
  return apiClient.post<AccountRequestResponse>("/auth/account-requests", payload);
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

/**
 * `POST /auth/request-password-reset` — ask for a password-reset link.
 *
 * The rule the whole flow rests on: **no administrator ever sees or sets
 * another person's password.** The link goes to the account's own address and
 * the account holder chooses the new password. The endpoint answers the same
 * way whether or not the address is known, so it cannot be used to find out
 * which addresses have accounts.
 */
export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }>("/auth/request-password-reset", { email });
}
