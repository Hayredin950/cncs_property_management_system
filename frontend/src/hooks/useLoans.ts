import { useQuery } from "@tanstack/react-query";
import { fetchOverdueLoans } from "../api/loans";

/**
 * The Property Officer's "Overdue loans" tile (`GET /loans/overdue`).
 *
 * Rewritten for the same reason as the rest of the dashboard tiles: it called the
 * endpoint with a bare, root-relative `fetch` — no `Authorization` header, an
 * origin that only works under `pnpm dev` — and folded every failure into
 * `{ count: 0 }`. The tile hides itself at zero, so a 401 looked exactly like a
 * clean loan register.
 *
 * Through `apiClient`, the token is attached and a real failure throws; the tile
 * renders that as an error rather than hiding as though there were nothing overdue.
 * `retry: false` for the same reason as the others: the API answers 401/403/500
 * here, never a "not built yet" 404 to tolerate.
 */
export function useOverdueLoans() {
  return useQuery({
    queryKey: ["loans", "overdue"],
    queryFn: ({ signal }) => fetchOverdueLoans(signal),
    retry: false,
  });
}
