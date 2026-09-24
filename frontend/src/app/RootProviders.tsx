import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./AuthContext";
import { ScrollToTop } from "./ScrollToTop";

/**
 * The router's root element.
 *
 * **Why `QueryClientProvider` is *not* here:** it lives in `main.tsx`, wrapping
 * `<RouterProvider>`. The test harness (`src/test/utils.tsx`) provides its own
 * fresh client for the same reason — cache isolation between tests — and the
 * only way that client is the one the hooks actually consume is if nothing
 * inside the route tree supplies a competing one. `AuthProvider` therefore
 * clears the cache via `useQueryClient()`, not by importing the module
 * singleton, so sign-out clears whichever client is currently in context.
 *
 * `AuthProvider` needs `useNavigate`, which only works *inside* the router
 * tree — hence this sits as the outermost route element rather than wrapping
 * `<RouterProvider>` directly.
 */
export function RootProviders() {
  return (
    <AuthProvider>
      {/* One listener for every shell — see ScrollToTop.tsx. */}
      <ScrollToTop />
      <Outlet />
      {/* Stack cap of 3, per frontend-design-system.md §8 — the rest queue up. */}
      <Toaster position="top-center" visibleToasts={3} richColors closeButton />
    </AuthProvider>
  );
}
