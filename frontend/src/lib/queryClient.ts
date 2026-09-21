import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../types/api";

/** A 4xx is a real answer from the server, not a transient failure — retrying
 *  a 401/403/404/409/410 just repeats the same answer slower. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
