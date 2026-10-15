import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { clearToken } from "../lib/storage";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";

const API = "http://localhost:4000/api/v1";

/**
 * `/request-account` — public form that asks for an account. Success shows a
 * confirmation and never stores a token: the account is pending until approved.
 *
 * The department list comes from `GET /departments` (the default MSW handler), not
 * from a constant in the component, so selecting "Biology" here proves the options
 * were rendered from the API response — and that what the form submits is the unit
 * the option carries, which is what the request is scoped by.
 */
describe("RequestAccountPage", () => {
  it("submits to account-requests and shows the confirmation", async () => {
    clearToken();
    let body: unknown = null;
    server.use(
      http.post(`${API}/auth/account-requests`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            message: "Request submitted for approval",
            request: {
              id: "req-new-1",
              fullName: "New Person",
              email: "new.person@aau.edu.et",
              accountStatus: "PENDING_APPROVAL",
              requestedAt: "2026-10-12T10:00:00.000Z",
            },
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/request-account"] });

    expect(await screen.findByRole("heading", { name: "Request an account" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Full name"), "New Person");
    await user.type(screen.getByLabelText("Email"), "new.person@aau.edu.et");
    await user.type(screen.getByLabelText("Password"), "SecurePass1");
    const select = await screen.findByLabelText<HTMLSelectElement>("Department");
    await screen.findByRole("option", { name: "Biology" });
    await user.selectOptions(select, "unit-bio");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() =>
      expect(body).toEqual({
        fullName: "New Person",
        email: "new.person@aau.edu.et",
        password: "SecurePass1",
        /** The unit id from the API, not a display name baked into the client. */
        department: "unit-bio",
      }),
    );

    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    expect(screen.getByText(/new\.person@aau\.edu\.et/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit request" })).not.toBeInTheDocument();
  });

  it("is linked from the login screen", async () => {
    clearToken();
    renderWithProviders({ initialEntries: ["/login"] });

    const link = await screen.findByRole("link", { name: "Request an account" });
    expect(link).toHaveAttribute("href", "/request-account");
  });
});
