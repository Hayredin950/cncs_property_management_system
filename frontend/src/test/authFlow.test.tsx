import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import { clearToken, getToken, setToken } from "../lib/storage";
import { server } from "./msw/server";
import { ADMIN_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * Both the sidebar and the mobile drawer's account card render the user's name —
 * scope name queries to one of them so "is the shell showing the signed-in user"
 * has one unambiguous answer.
 *
 * The name used to be in the top bar, and moved out when the drawer's account
 * section became the single place the header says who you are
 * (`components/aau/HeaderAccountBlock`): on a phone the bar has room for exactly
 * one trailing control, which is the Dashboard button in both shells.
 */
function sidebar() {
  return screen.getByRole("complementary");
}

describe("LoginPage", () => {
  it("logs in, stores the token, and lands on the dashboard", async () => {
    clearToken();
    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/login"] });

    await user.type(screen.getByLabelText("Email"), "admin@cncs.aau.edu.et");
    await user.type(screen.getByLabelText("Password"), "Admin123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(getToken()).toBe("test-token");
    });
    // `next` defaults to /dashboard (LoginPage). The dashboard's h1 is the
    // unambiguous landmark; nav links + headings share the word elsewhere.
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(within(sidebar()).getByText("Abebe Admin")).toBeInTheDocument();
  });

  it("shows the server's 401 message verbatim on bad credentials", async () => {
    clearToken();
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ error: "Invalid credentials" }, { status: 401 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/login"] });

    await user.type(screen.getByLabelText("Email"), "admin@cncs.aau.edu.et");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });
});

describe("route guards", () => {
  it("redirects an anonymous visitor from a guarded route to login with next", async () => {
    clearToken();
    renderWithProviders({ initialEntries: ["/dashboard"] });

    expect(await screen.findByText("Staff sign in")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("rehydrates a valid token into an authenticated shell without a login redirect", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    // /auth/me resolves the stored token into a user; the guarded page renders.
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByText("Staff sign in")).not.toBeInTheDocument();
  });

  it("renders the shared 404 for an unknown path", async () => {
    renderWithProviders({ initialEntries: ["/no-such-page"] });

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("Page not found")).toBeInTheDocument();
  });
});

describe("401 handling", () => {
  it("clears the token and redirects to login when the API answers 401 mid-session", async () => {
    // Start authenticated (token present, /auth/me succeeds), then have every
    // subsequent request 401 — the stale-token mid-session case. Both the
    // badge poll and the requests list fail, but the redirect must fire once
    // and land on /login?next=/dashboard.
    localStorage.setItem("cncs.auth.token", "expired-token");
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: ADMIN_USER })),
      http.get(`${API}/requests/pending-count`, () =>
        HttpResponse.json({ error: "Token expired" }, { status: 401 }),
      ),
      http.get(`${API}/requests`, () => HttpResponse.json({ error: "Token expired" }, { status: 401 })),
    );

    renderWithProviders({ initialEntries: ["/dashboard"] });

    await waitFor(
      () => {
        expect(getToken()).toBeNull();
      },
      { timeout: 3000 },
    );
    expect(await screen.findByText("Staff sign in")).toBeInTheDocument();
  });
});
