import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * `/profile` — the account screen the phone has had all along.
 *
 * The web sidebar named the account and offered Sign out, but no page answered
 * "what is this account, and how do I change its password?". The fields are
 * read-only: the office that owns the account sets the name and email, and the
 * only self-service action is the password.
 */
describe("/profile", () => {
  it("shows the signed-in account and links to the password screen", async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
    );

    setToken("test-token");
    const { router } = renderWithProviders({ initialEntries: ["/profile"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    expect(within(main).getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(within(main).getByText(STAFF_USER.fullName)).toBeInTheDocument();
    expect(within(main).getByText(STAFF_USER.email)).toBeInTheDocument();
    expect(within(main).getByText("Staff")).toBeInTheDocument();

    // Change password is a real navigation, not a dead button.
    await user.click(within(main).getByRole("button", { name: /Change password/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/change-password"));
  });

  it("signs out from the page, back to the anonymous shell", async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
    );

    setToken("test-token");
    const { router } = renderWithProviders({ initialEntries: ["/profile"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await user.click(within(main).getByRole("button", { name: /^Sign out$/i }));

    // `signOut` is client-side only: the token goes, the guard sends the next
    // render to the login screen. Staying on `/profile` would be a screen full
    // of empty rows.
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });
});
