import { apiClient } from "../lib/apiClient";
import type {
  CreateRequestPayload,
  CreateRequestResponse,
  DecideRequestResponse,
  PendingCountResponse,
  RequestByIdResponse,
  RequestListQuery,
  RequestsListResponse,
} from "../types/request";

/**
 * `GET /requests` — Staff/Admin. The server scopes the result itself (staff see
 * their own, admin sees all), so the client sends no user id and never tries to
 * re-implement that rule.
 */
export function fetchRequests(
  query: RequestListQuery = {},
  signal?: AbortSignal,
): Promise<RequestsListResponse> {
  return apiClient.get<RequestsListResponse>("/requests", { ...query }, signal);
}

/** `GET /requests/:id` — 404 (never 403) for a staff member on someone else's request. */
export function fetchRequestById(id: string, signal?: AbortSignal): Promise<RequestByIdResponse> {
  return apiClient.get<RequestByIdResponse>(`/requests/${encodeURIComponent(id)}`, undefined, signal);
}

/** `GET /requests/pending-count` — Staff/Admin; drives the nav badge. */
export function fetchPendingCount(signal?: AbortSignal): Promise<PendingCountResponse> {
  return apiClient.get<PendingCountResponse>("/requests/pending-count", undefined, signal);
}

/**
 * `POST /requests` — files a TRANSFER or DISPOSAL. One PENDING request per item:
 * a second answers 409 pointing at the conflict (surface it as a link to the
 * existing request, never a dead end — frontend-plan.md §7).
 */
export function createRequest(payload: CreateRequestPayload): Promise<CreateRequestResponse> {
  return apiClient.post<CreateRequestResponse>("/requests", payload);
}

/** `POST /requests/:id/approve` — Admin only (403 for staff). */
export function approveRequest(id: string): Promise<DecideRequestResponse> {
  return apiClient.post<DecideRequestResponse>(`/requests/${encodeURIComponent(id)}/approve`);
}

/** `POST /requests/:id/reject` — Admin only; `rejectionReason` required (3–500 chars). */
export function rejectRequest(id: string, rejectionReason: string): Promise<DecideRequestResponse> {
  return apiClient.post<DecideRequestResponse>(`/requests/${encodeURIComponent(id)}/reject`, {
    rejectionReason,
  });
}

/** `POST /requests/:id/withdraw` — Requester only, while PENDING/PENDING_STAGE1/PENDING_STAGE2. */
export function withdrawRequest(id: string, reason?: string): Promise<RequestByIdResponse> {
  return apiClient.post<RequestByIdResponse>(`/requests/${encodeURIComponent(id)}/withdraw`, {
    reason,
  });
}

/**
 * `POST /requests/:id/return-initiate` — Borrower initiates return of a loan.
 * Requires loan request in APPROVED status.
 */
export function initiateLoanReturn(id: string): Promise<RequestByIdResponse> {
  return apiClient.post<RequestByIdResponse>(`/requests/${encodeURIComponent(id)}/return-initiate`);
}

/**
 * `POST /requests/:id/return-confirm` — Lender/Property Officer confirms loan return with condition check.
 * Body: condition (required), notes (optional).
 */
export function confirmLoanReturn(id: string, condition: string, notes?: string | null): Promise<{ requestId: string; itemId: string }> {
  return apiClient.post<{ requestId: string; itemId: string }>(`/requests/${encodeURIComponent(id)}/return-confirm`, { condition, notes });
}

/**
 * `POST /requests/:id/return-dispute` — Lender/Property Officer disputes a borrower-initiated return.
 * Body: reason (3-500 chars required).
 */
export function disputeLoanReturn(id: string, reason: string): Promise<RequestByIdResponse> {
  return apiClient.post<RequestByIdResponse>(`/requests/${encodeURIComponent(id)}/return-dispute`, { reason });
}
