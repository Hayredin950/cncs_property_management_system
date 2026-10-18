import { apiClient } from "../lib/apiClient";

/**
 * `POST /api/v1/expiry/check` — Run all expiry checks (SYSTEM_ADMIN only).
 * Triggers claim expiry, approval escalation, return confirmation expiry, and handover verification expiry.
 */
export function checkExpiries(): Promise<{
  success: boolean;
  expiredClaims: number;
  expiredApprovals: number;
  expiredReturnConfirmations: number;
  expiredHandoverVerifications: number;
  timestamp: string;
}> {
  return apiClient.post("/expiry/check");
}

/**
 * `GET /api/v1/expiry/status` — Get current expiry status without running checks (SYSTEM_ADMIN only).
 */
export function getExpiryStatus(): Promise<{
  expiredClaims: number;
  expiredApprovals: number;
  expiredReturnConfirmations: number;
  expiredHandoverVerifications: number;
  timestamp: string;
}> {
  return apiClient.get("/expiry/status");
}