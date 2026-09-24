import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ADMIN_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * An administrator reset sets `mustChangePassword`, and the app must not let that
 * session reach any other screen until the holder picks their own password —
 * otherwise the "forced" part is only a suggestion that a deep link can bypass.
 */
describe("forced password change", () => {
  it("redirects a flagged session to the change screen and returns to the app after", async () => {
    let changeBody: unknown = null;
    server.use(
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({ user: { ...ADMIN_USER, mustChangePassword: true } }),
      ),
      http.post(`${API}/auth/change-password`, async ({ request }) => {
        changeBody = await request.json();
        return HttpResponse.json({
          token: "new-token",
          user: { ...ADMIN_USER, mustChangePassword: false },
        });
      }),
    );

    setToken("test-token");
    const { router } = renderWithProviders({ initialEntries: ["/dashboard"] });
    const user = userEvent.setup();

    // The guard sends a must-change session here from every other route.
    expect(await screen.findByText("Choose a new password")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/change-password");

    await user.type(screen.getByLabelText("Current password"), "TempPassword1");
    await user.type(screen.getByLabelText("New password"), "BrandNewPass1");
    await user.type(screen.getByLabelText("Confirm new password"), "BrandNewPass1");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(changeBody).toEqual({
      currentPassword: "TempPassword1",
      newPassword: "BrandNewPass1",
    }));
    // Cleared flag + fresh session means the normal app is reachable again.
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });
});
