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
