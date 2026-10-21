import { useQuery } from "@tanstack/react-query";
import { fetchSystemEvents, fetchSystemStatus } from "../api/system";

/**
 * The SYSTEM_ADMIN dashboard's two tiles.
 *
 * Both endpoints require a token (`SYSTEM_CONFIG`, SYSTEM_ADMIN only), and both
 * live at `/system/*` — the mount in `app.ts:116`, not the `/admin/system/*`
 * these hooks used to call. The old versions sent no `Authorization` header and
 * swallowed every failure into `{ environment: "Unknown" }` / `[]`, so a 401 and
 * a 500 both rendered as a tidy tile with nothing in it. A widget that cannot
 * load its data now says so; that rule is §13's, and it exists because this
 * exact tile was the original silent-zero failure.
 */

/** `GET /system/status` — environment, version, uptime, last deploy. */
export function useSystemStatus() {
  return useQuery({
    queryKey: ["system", "status"],
    queryFn: ({ signal }) => fetchSystemStatus(signal),
  });
}

/**
 * `GET /system/events?limit=10` — recent account-level events. Empty is the
 * expected answer until the account flows write `AdminActionLog` (T5–T7); the
 * widget shows an empty state for it rather than a spinner or a zero.
 */
/**
 * The account log, newest first.
 *
 * `limit` is the dashboard's own ("the last few") and the events page asks for
 * a page of its own; the key includes the query so the two never share a
 * cache entry.
 */
export function useRecentSystemEvents(limit = 5) {
  return useQuery({
    queryKey: ["system", "events", { limit }],
    queryFn: ({ signal }) => fetchSystemEvents(limit, signal),
  });
}

/** One page of the account log, with the filters the events page offers. */
export function useSystemEvents(query: { limit?: number; offset?: number; action?: string; search?: string }) {
  return useQuery({
    queryKey: ["system", "events", query],
    queryFn: ({ signal }) => fetchSystemEvents(query.limit ?? 20, signal, query),
  });
}
