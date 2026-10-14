import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { ACCEPTED_INVITE_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * `/accept-invite?token=…` — where an invited head, officer, auditor or system
 * admin chooses their own password (T6).
 *
 * The four states are the whole point of the page: a link with no token, a link
 * the server refuses, a link that works, and the fact that none of this needs a
 * signed-in session. The password is asserted **on the wire** — the server is the
 * only thing that may see it, and the token from the URL is the credential the
 * account was created for.
 */
describe("/accept-invite", () => {
  it("sets the password with the token from the link, and signs the invitee in", async () => {
    let body: unknown = null;
    server.use(
      http.post(`${API}/auth/accept-invite`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: "invite-session-token", user: ACCEPTED_INVITE_USER });
      }),
    );

    const { router } = renderWithProviders({
      initialEntries: ["/accept-invite?token=link-token-123"],
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Set your password" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Your full name"), "New Head");
    await user.type(screen.getByLabelText("New password"), "chosen-by-me-123");
    await user.type(screen.getByLabelText("Confirm password"), "chosen-by-me-123");
    await user.click(screen.getByRole("button", { name: /set my password and sign in/i }));

    // The token travels with the password: it names the invitation, and the
    // server is what decides whether it is still good.
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      token: "link-token-123",
      password: "chosen-by-me-123",
      fullName: "New Head",
    });

    // Signed in on this device rather than asked to type the password again.
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });

  it("refuses to submit two passwords that differ, without calling the API", async () => {
    let called = false;
    server.use(
      http.post(`${API}/auth/accept-invite`, () => {
        called = true;
        return HttpResponse.json({ error: "unreachable" }, { status: 500 });
      }),
    );

    renderWithProviders({ initialEntries: ["/accept-invite?token=link-token-123"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Set your password" });
    await user.type(screen.getByLabelText("Your full name"), "New Head");
    await user.type(screen.getByLabelText("New password"), "chosen-by-me-123");
    await user.type(screen.getByLabelText("Confirm password"), "something-else-123");
    await user.click(screen.getByRole("button", { name: /set my password and sign in/i }));

    expect(await screen.findByText(/don't match/)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("says the link is incomplete when the address was opened without a token", async () => {
    renderWithProviders({ initialEntries: ["/accept-invite"] });

    expect(await screen.findByText("This link is incomplete")).toBeInTheDocument();
    // No form at all: a submit button here could only fail.
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set my password/i })).not.toBeInTheDocument();
  });

  it("shows the server's own reason for a dead link and points at a new one", async () => {
    server.use(
      http.post(`${API}/auth/accept-invite`, () =>
        HttpResponse.json(
          { error: "This invite link has expired. Ask an administrator for a new one." },
          { status: 400 },
        ),
      ),
    );

    const { router } = renderWithProviders({
      initialEntries: ["/accept-invite?token=stale-token"],
    });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Set your password" });
    await user.type(screen.getByLabelText("Your full name"), "New Head");
    await user.type(screen.getByLabelText("New password"), "chosen-by-me-123");
    await user.type(screen.getByLabelText("Confirm password"), "chosen-by-me-123");
    await user.click(screen.getByRole("button", { name: /set my password and sign in/i }));

    // Retrying the same dead link cannot work, so the page says what does.
    expect(await screen.findByText(/has expired/)).toBeInTheDocument();
    expect(screen.getByText(/Ask the administrator who invited you to send a new invitation/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/accept-invite");
  });

  it("is reachable by an anonymous visitor, with no session to begin with", async () => {
    // No token set, and `/auth/me` is never called: the invitation is the
    // credential, and the page must not sit behind a sign-in.
    renderWithProviders({ initialEntries: ["/accept-invite?token=link-token-123"] });

    expect(await screen.findByRole("heading", { name: "Set your password" })).toBeInTheDocument();
    expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
  });
});
