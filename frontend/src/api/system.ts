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
  /** Seconds the instance serving the request has been running. On a serverless
   *  platform a cold start resets it — that is the honest answer, and it is
   *  about the instance rather than about the deployment. */
  uptime: number;
  /** When the running instance started. */
  startedAt: string;
  /** When this build ran, from the stamp the build writes. Null when the
   *  deployment predates the stamp — the screen says so rather than guessing. */
  builtAt: string | null;
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
  /** Who did it. */
  actor: { fullName: string; email: string } | null;
  /** Who it was about. */
  target: { fullName: string; email: string } | null;
  /** The unit it concerned. */
  unit: string | null;
  /** What the record looked like before and after — the detail the log exists for. */
  before: unknown;
  after: unknown;
  /** The authority an invitation or a decision was made under. */
  authorizedBy: string | null;
  authorizationRef: string | null;
}

export interface SystemEventsResponse {
  events: SystemEvent[];
  total: number;
  limit: number;
  offset: number;
}

export function fetchSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
  return apiClient.get<SystemStatus>("/system/status", undefined, signal);
}

/**
 * `limit` is clamped server-side (1–50), so a caller can pass what it likes:
 * an out-of-range value comes back as the nearest legal page rather than a 400
 * on a tile refresh.
 */
export function fetchSystemEvents(
  limit = 10,
  signal?: AbortSignal,
  query: { offset?: number; action?: string; search?: string } = {},
): Promise<SystemEventsResponse> {
  return apiClient.get<SystemEventsResponse>("/system/events", { limit, ...query }, signal);
}

/**
 * The shape of the college's register — counts, not rows.
 *
 * The status page used to answer "is it up?" and nothing else. An
 * administrator wants to know how much the system holds and how it is being
 * used: how many accounts and how many are waiting, what the decisions were,
 * what the assets look like, whether the requests are moving.
 */
export interface SystemStatistics {
  accounts: {
    total: number;
    byStatus: Record<string, number>;
    perMonth: { month: string; count: number }[];
  };
  decisions: { action: string; count: number }[];
  items: {
    total: number;
    byStatus: Record<string, number>;
    byDepartment: { name: string; count: number }[];
  };
  requests: {
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  audits: { byType: Record<string, number> };
}

export function fetchSystemStatistics(signal?: AbortSignal): Promise<SystemStatistics> {
  return apiClient.get<SystemStatistics>("/system/statistics", undefined, signal);
}
