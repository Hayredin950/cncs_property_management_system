import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";

const API = "http://localhost:4000/api/v1";

/**
 * `/reset-password?token=…` — F15's other half.
 *
 * C10 says no administrator ever sees or sets a password. The admin screen can
 * only *trigger* the link (covered in `adminAccounts.test.tsx`); this is where
 * the account holder uses it. The password is asserted on the wire, and the
 * token must come from the URL — never from a form field a caller could invent.
 */
describe("/reset-password", () => {
  it("sends the link's token and the chosen password to the server", async () => {
    let body: unknown = null;
    server.use(
      http.post(`${API}/auth/reset-password`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: "Password reset successfully" });
      }),
    );

    const { router } = renderWithProviders({
      initialEntries: ["/reset-password?token=reset-token-456"],
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "chosen-by-me-123");
    await user.type(screen.getByLabelText("Confirm password"), "chosen-by-me-123");
    await user.click(screen.getByRole("button", { name: /set my new password/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ token: "reset-token-456", newPassword: "chosen-by-me-123" });

    // Signed out everywhere by the server's tokenVersion bump; this device goes
    // back to sign in rather than pretending the old session survived.
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("shows the server's own reason for a dead link, and does not pretend it worked", async () => {
    server.use(
      http.post(`${API}/auth/reset-password`, () =>
        HttpResponse.json({ error: "Token has expired" }, { status: 400 }),
      ),
    );

    const { router } = renderWithProviders({
      initialEntries: ["/reset-password?token=stale"],
    });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Choose a new password" });
    await user.type(screen.getByLabelText("New password"), "chosen-by-me-123");
    await user.type(screen.getByLabelText("Confirm password"), "chosen-by-me-123");
    await user.click(screen.getByRole("button", { name: /set my new password/i }));

    expect(await screen.findByText("Token has expired")).toBeInTheDocument();
    // Still on the page, with the "ask for a new one" way out next to the error.
    expect(router.state.location.pathname).toBe("/reset-password");
    expect(screen.getByRole("link", { name: /ask for a new one/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("says a link with no token is incomplete instead of showing a form that cannot work", async () => {
    renderWithProviders({ initialEntries: ["/reset-password"] });

    expect(await screen.findByText("This link is incomplete")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
