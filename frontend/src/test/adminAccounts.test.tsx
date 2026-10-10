import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ADMIN_ACCOUNT, STAFF_ACCOUNT, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * `/admin/users` — the accounts screen (F1.3).
 *
 * Two things are under test beyond "it renders": the role boundary (a staff
 * account must not reach the page at all, and hiding the nav link is not a
 * boundary), and the one-directional promote — asserted through the wire, since
 * "an admin exists" is only a claim about pixels until the request says so.
 */
describe("/admin/users — the accounts screen", () => {
  it("lists every account with its item count for an admin", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    expect(await screen.findByRole("heading", { name: "Accounts" })).toBeInTheDocument();
    // Scoped to the page body: the signed-in admin's own name also appears in
    // the navigation panel, so a document-wide text query would match twice.
    const main = await screen.findByRole("main");
    expect(await within(main).findByText(ADMIN_ACCOUNT.fullName)).toBeInTheDocument();
    expect(within(main).getByText(STAFF_ACCOUNT.fullName)).toBeInTheDocument();
    // The count is the column that tells an admin whether an account is part of
    // the record before they try to remove it.
    expect(within(main).getByText(/3 items/)).toBeInTheDocument();
    expect(within(main).getByText(/No items/)).toBeInTheDocument();
  });

  it("promotes a staff account only after a confirmation that names the access", async () => {
    let promotedId: string | null = null;
    server.use(
      http.post(`${API}/users/:id/promote`, ({ params }) => {
        promotedId = params.id as string;
        return HttpResponse.json({ ...STAFF_ACCOUNT, role: "ADMIN" });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    // The only Promote on the page belongs to the staff account — an admin is
    // not offered the action at all, because there is no demote to pair with it.
    await user.click(await screen.findByRole("button", { name: "Promote" }));

    expect(await screen.findByText(/full administrator access/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Promote to admin" }));

    await waitFor(() => expect(promotedId).toBe(STAFF_USER.id));
  });

  it("never offers the acting administrator a way to delete themselves", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    const own = await screen.findByRole("button", { name: /you cannot delete your own account/i });
    expect(own).toBeDisabled();
  });

  it("changes an account's password through the reset dialog", async () => {
    let body: unknown = null;
    server.use(
      http.post(`${API}/users/:id/password`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: STAFF_USER.id, passwordChanged: true });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: `Change password for ${STAFF_USER.fullName}` }),
    );
    await user.type(await screen.findByLabelText("New password"), "BrandNew123");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(body).toEqual({ password: "BrandNew123" }));
  });

  it("is not reachable by a staff account at all", async () => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })));
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    // The same 404 an unknown path renders — there is no "forbidden" page.
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Accounts" })).not.toBeInTheDocument();
  });
});
