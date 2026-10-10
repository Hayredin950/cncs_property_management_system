import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { queryClient } from "./lib/queryClient";
import "./styles/globals.css";

/**
 * The single bootstrap: mount the router.
 *
 * `QueryClientProvider` wraps `<RouterProvider>` rather than living inside the
 * route tree so that the test harness can substitute a fresh client for the
 * same reason (`src/test/utils.tsx`). Everything else that needs React context
 * (auth, toasts) lives in `app/RootProviders.tsx`.
 */
const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
