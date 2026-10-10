/** The raw error body every failed request returns (frontend-plan.md §4). */
export interface ApiErrorBody {
  error: string;
  details?: unknown;
}

/**
 * Normalized shape every screen actually branches on. `message` is the server's
 * own `error` string, shown verbatim — never reworded (frontend-design-system.md §2).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/** Thrown by the client for a connection-level failure — no HTTP response at all. */
export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}
