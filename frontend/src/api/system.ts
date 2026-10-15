import { apiClient } from "../lib/apiClient";

/**
 * `GET /health` — the backend mounts it both at `/health` and `/api/v1/health`
 * (`app.ts`), and `apiClient` always joins the versioned base, so calling
 * `"/health"` here reaches the same handler. It is unauthenticated and returns a
 * fixed `{ status: "ok" }`, which is all the indicator needs: enough to tell
 * "the API is reachable" from "the API isn't", nothing more.
 */
export interface HealthResponse {
  status: string;
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiClient.get<HealthResponse>("/health", undefined, signal);
}

/**
 * The SYSTEM_ADMIN dashboard's two tiles — `GET /system/status` and
 * `GET /system/events`.
 *
 * Both go through `apiClient` on purpose. They used to be hand-rolled `fetch`
 * calls in `hooks/useSystem.ts` with no `Authorization` header and a 404-shaped
 * fallback for every failure, which produced two bugs that hid each other: the
 * request was refused (401) and the hook turned that into "Unknown" — a widget
 * that looks like real data and never was. `apiClient` attaches the token and
 * raises `ApiError`, so an unreachable tile now says so.
 */

export interface SystemStatus {
  environment: string;
  version: string;
  uptime: number;
  lastDeploy: string;
  database: string;
}

/**
 * One row of the account log (§10.4). `type` is the stored action slug
 * (`ACCOUNT_APPROVED`) and `message` is the sentence naming who it happened to —
 * the widget renders both, which is why the pair is split this way rather than
 * sending prose alone.
 */
export interface SystemEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export function fetchSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
  return apiClient.get<SystemStatus>("/system/status", undefined, signal);
}

/**
 * `limit` is clamped server-side (1–50), so a caller can pass what it likes:
 * an out-of-range value comes back as the nearest legal page rather than a 400
 * on a tile refresh.
 */
export function fetchSystemEvents(limit = 10, signal?: AbortSignal): Promise<SystemEvent[]> {
  return apiClient.get<SystemEvent[]>("/system/events", { limit }, signal);
}
