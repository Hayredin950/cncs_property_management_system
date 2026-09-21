import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { server } from "./msw/server";

// CI machines and dev boxes running the docker stack alongside the suite can
// push the login → rehydrate → render chain past RTL's 1s default — these are
// timing flakes, not logic, so the wait budget is set once here.
configure({ asyncUtilTimeout: 4000 });

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
