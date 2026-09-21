import type { Role } from "./enums";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  createdAt: string;
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
