import { apiClient } from "../lib/apiClient";
import type { LoginRequest, LoginResponse, MeResponse } from "../types/user";

/** `POST /auth/login` — public. See types/user.ts for why only `.user` is read back out. */
export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/auth/login", payload);
}

/** `GET /auth/me` — rehydrates a stored token into a user on boot. */
export function fetchCurrentUser(signal?: AbortSignal): Promise<MeResponse> {
  return apiClient.get<MeResponse>("/auth/me", undefined, signal);
}
