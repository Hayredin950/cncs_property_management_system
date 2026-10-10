import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../api/system";

/**
 * `GET /health` for the "is the backend up?" indicator. Polled slowly (60s) and
 * never retried: the only question it answers is reachable-or-not, and a retry
 * storm on a dead backend is worse than a stale dot. `staleTime` matches the poll
 * so a window refocus doesn't trigger a second request.
 */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
