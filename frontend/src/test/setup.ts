import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { server } from "./msw/server";

/**
 * jsdom implements no `ResizeObserver`, and `AppLayout` uses one to keep the
 * sidebar's sticky offset in sync with the header's measured height (the header
 * is `sticky top-0` and content-sized, so a hardcoded `top-16` is a guess that
 * would bury the nav behind an opaque bar). Without this, every authenticated
 * test dies in the shell's mount effect with "ResizeObserver is not defined".
 *
 * A no-op is the truthful stub: jsdom has no layout, so every observed element
 * measures 0×0 anyway. The *default* offset on the shell's inline style is what
 * the tests see, and the real value is a browser concern.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// CI machines and dev boxes running the docker stack alongside the suite can
// push the login → rehydrate → render chain past RTL's 1s default. Every screen
// here sits behind `GET /auth/me`, so nothing renders until that resolves, and a
// starved worker turns that into a "can't find the heading" failure. These are
// timing flakes, not logic, so the wait budget is set once, generously, here.
// It only caps *how long* a failing query waits — a passing test never sits on it.
configure({ asyncUtilTimeout: 10_000 });

// MSW intercepts at the network layer so the tests exercise the real
// `apiClient` — fetch, headers, error normalization and all — rather than a
// stubbed hook (Frontend_Three_Phase_Plan.md §1.4).
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  // localStorage leaks a token between tests and turns an "anonymous visitor"
  // test into an authenticated one; sessionStorage leaks form drafts.
  localStorage.clear();
  sessionStorage.clear();
});
afterAll(() => server.close());
