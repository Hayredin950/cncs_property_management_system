import { ApiError, NetworkError, type ApiErrorBody } from "../types/api";
import { API_BASE_URL } from "./env";
import { clearToken, getToken } from "./storage";

/**
 * The one fetch wrapper every `api/*` module goes through (frontend-plan.md §4):
 * Bearer token attached automatically, every failure normalized to `ApiError`,
 * and 401 handled in exactly one place.
 */

/**
 * Any JSON-serializable request body. `object`, not `Record<string, unknown>`:
 * an interface without an index signature (e.g. `LoginRequest`) is assignable
 * to `object` but not to `Record<string, unknown>` — the practical difference
 * between every `api/*` call site compiling or not.
 */
type JsonBody = object;
type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: JsonBody;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

/**
 * Registered once by `AuthProvider` (app/AuthContext.tsx). Kept as a plain
 * module-level callback, not a React import, so this file has no dependency on
 * React or the router — a 401 during a plain data fetch must be able to trigger
 * a redirect without the client needing to know how routing works.
 */
type UnauthorizedHandler = (next: string) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${cleanPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function safeParseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Shared by every request path below: 401 clears the token and notifies the app once. */
function handleUnauthorized(): void {
  clearToken();
  if (unauthorizedHandler) {
    unauthorizedHandler(window.location.pathname + window.location.search);
  }
}

async function throwForErrorResponse(res: Response): Promise<never> {
  const body = await safeParseJson<ApiErrorBody>(res);
  throw new ApiError(res.status, body?.error ?? `Request failed with status ${res.status}`, body?.details);
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal } = options;
  const headers = authHeaders({
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
  });

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : "Network request failed");
  }

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    await throwForErrorResponse(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/**
 * `GET /items/:id/tag` (QR PNG) and every report endpoint are auth-protected, so a
 * plain `<a href>` sends no token (frontend-plan.md §4). This is the one place a
 * binary response is fetched, always through the same auth headers and the same
 * 401/error handling as `request()`.
 */
async function requestBlob(path: string, query?: Record<string, QueryValue>): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { headers: authHeaders() });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : "Network request failed");
  }

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    await throwForErrorResponse(res);
  }

  return res.blob();
}

/** Triggers a browser download for a `Blob` obtained via `apiClient.blob(...)`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const apiClient = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    request<T>(path, { method: "GET", ...(query ? { query } : {}), ...(signal ? { signal } : {}) }),
  post: <T>(path: string, body?: JsonBody, signal?: AbortSignal) =>
    request<T>(path, { method: "POST", ...(body !== undefined ? { body } : {}), ...(signal ? { signal } : {}) }),
  put: <T>(path: string, body?: JsonBody, signal?: AbortSignal) =>
    request<T>(path, { method: "PUT", ...(body !== undefined ? { body } : {}), ...(signal ? { signal } : {}) }),
  delete: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { method: "DELETE", ...(signal ? { signal } : {}) }),
  blob: requestBlob,
};
