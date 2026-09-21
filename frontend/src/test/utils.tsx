import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { RenderOptions } from "@testing-library/react";
import { appRoutes } from "../app/router";

/**
 * Renders the production route tree (the *same* `appRoutes` array `main.tsx`
 * uses) inside a memory router, with a fresh `QueryClient` so no cache leaks
 * between tests. The auth provider sits inside `RootProviders`, so tests
 * exercise the real login/guard flows, not a stubbed auth context.
 *
 * Screens are addressed by URL (`initialEntries`), never by rendering them in
 * isolation — route guards, loaders, and layout nesting are part of what's
 * under test.
 */
export function renderWithProviders({
  initialEntries = ["/"],
  ...options
}: { initialEntries?: string[] } & Omit<RenderOptions, "wrapper"> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(appRoutes, { initialEntries });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
    options,
  );

  // The router is exposed so tests can assert on URL-held state via
  // `router.state.location` — a memory router's navigations don't touch
  // jsdom's `window.location`, but the URL state itself is what's under test.
  return { ...result, router };
}
