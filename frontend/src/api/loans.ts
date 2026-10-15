import { apiClient } from "../lib/apiClient";

/**
 * `GET /loans/overdue` — how many approved loans are past their due date and not
 * yet returned, for the Property Officer's dashboard tile.
 *
 * The tile previously reached this endpoint with a bare, root-relative `fetch`: no
 * `Authorization` header (a 401 on the API host) and an origin that is only correct
 * under `pnpm dev`. Worse, every failure — including that 401 and the parse error a
 * login page's HTML produces — was swallowed into `{ count: 0 }`, and the tile hides
 * itself at zero. A tile that hides on failure and hides at zero is a tile nobody
 * can tell from "no overdue loans", which is the one thing a risk register must not
 * say by accident. Going through `apiClient` attaches the token and lets a real
 * failure reach the tile.
 */
export function fetchOverdueLoans(signal?: AbortSignal): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>("/loans/overdue", undefined, signal);
}
