import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { SYSTEM_ADMIN_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * The invite form on `/admin/users` (T6) — the panel that replaces the legacy
 * "Create an account" flow.
 *
 * What these tests are actually about: **an administrator never sets a password,
 * and never appoints anyone without recording who authorized it.** Both are
 * properties of the request that leaves the browser, so they are asserted on the
 * wire rather than on the screen. A form that asked for the two authorization
 * fields but dropped them on submit, or one that quietly kept a password field,
 * would render identically and fail here.
 */
describe("/admin/users — inviting a privileged account (T6)", () => {
  beforeEach(() => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: SYSTEM_ADMIN_USER })));
  });

  it("asks for the outside authorization and offers no password field at all", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    const main = await screen.findByRole("main");
    await within(main).findByText("Invite an account");

    // D3: the two fields that record the decision made outside the system.
    expect(within(main).getByLabelText("Authorized by")).toBeInTheDocument();
    expect(within(main).getByLabelText("Authorization reference")).toBeInTheDocument();

    // The requirement itself: there is no field an administrator could type a
    // password into, and no legacy panel left beside this one.
    expect(within(main).queryByLabelText(/temporary password/i)).not.toBeInTheDocument();
    expect(within(main).queryByText("Create an account")).not.toBeInTheDocument();
  });

  it("offers only the four roles that are never self-registered", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    const main = await screen.findByRole("main");
    const select = (await within(main).findByLabelText("Role")) as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);

    // D2: Staff come through the public request form and a head's approval, so
    // Staff is deliberately absent from an invite.
    expect(values).toEqual([
      "DEPARTMENT_HEAD",
      "PROPERTY_OFFICER",
      "AUDITOR",
      "ACCOUNT_ADMIN",
    ]);
    expect(values).not.toContain("STAFF");
  });

  it("asks for a department only when the appointment is a head's", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    // The default is a head, and a head is the one role bound to a unit.
    expect(await within(main).findByLabelText("Department")).toBeInTheDocument();
    // Chemistry already has a working head, and the picker says so rather than
    // letting the administrator find out from a 400 after filling the form in.
    await waitFor(() =>
      expect(within(main).getByText("Chemistry — already has a head")).toBeInTheDocument(),
    );

    await user.selectOptions(within(main).getByLabelText("Role"), "PROPERTY_OFFICER");
    await waitFor(() =>
      expect(within(main).queryByLabelText("Department")).not.toBeInTheDocument(),
    );
  });

  it("sends the authorization, the role and the unit — and no password", async () => {
    let body: unknown = null;
    server.use(
      http.post(`${API}/users/invite`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            invite: {
              userId: "invitee-1",
              email: "newhead@cncs.aau.edu.et",
              role: "DEPARTMENT_HEAD",
              unitId: "unit-phys",
              status: "PENDING_EMAIL_VERIFICATION",
              expiresAt: "2026-10-17T08:00:00.000Z",
              renewed: false,
            },
            inviteUrl: "http://localhost:5173/accept-invite?token=abc123",
            email: "skipped",
          },
          { status: 201 },
        );
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await within(main).findByText("Invite an account");

    await user.type(within(main).getByLabelText("Email"), "newhead@cncs.aau.edu.et");
    await user.selectOptions(await within(main).findByLabelText("Department"), "unit-phys");
    await user.type(within(main).getByLabelText("Authorized by"), "College Office");
    await user.type(within(main).getByLabelText("Authorization reference"), "CNCS/HR/2026/117");
    await user.click(within(main).getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      email: "newhead@cncs.aau.edu.et",
      role: "DEPARTMENT_HEAD",
      unitId: "unit-phys",
      authorizedBy: "College Office",
      authorizationRef: "CNCS/HR/2026/117",
      authorizationNote: null,
    });
    // Belt-and-braces on the requirement: no key of this payload can be a
    // credential, whatever the form later grows.
    expect(Object.keys(body as object)).not.toContain("password");
  });

  it("hands the administrator the single-use link when nothing was emailed", async () => {
    server.use(
      http.post(`${API}/users/invite`, () =>
        HttpResponse.json(
          {
            invite: {
              userId: "invitee-1",
              email: "newhead@cncs.aau.edu.et",
              role: "DEPARTMENT_HEAD",
              unitId: "unit-phys",
              status: "PENDING_EMAIL_VERIFICATION",
              expiresAt: "2026-10-17T08:00:00.000Z",
              renewed: false,
            },
            inviteUrl: "http://localhost:5173/accept-invite?token=abc123",
            // The live default: no SMTP transport is configured.
            email: "skipped",
          },
          { status: 201 },
        ),
      ),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await within(main).findByText("Invite an account");

    await user.type(within(main).getByLabelText("Email"), "newhead@cncs.aau.edu.et");
    await user.selectOptions(await within(main).findByLabelText("Department"), "unit-phys");
    await user.type(within(main).getByLabelText("Authorized by"), "College Office");
    await user.type(within(main).getByLabelText("Authorization reference"), "CNCS/HR/2026/117");
    await user.click(within(main).getByRole("button", { name: "Send invite" }));

    // The link is on screen and copyable, and the copy says the mail did not go
    // out — an invitation the administrator believes was emailed is one nobody
    // ever opens.
    expect(
      await within(main).findByText(/No mail transport is configured/),
    ).toBeInTheDocument();
    expect(
      within(main).getByText("http://localhost:5173/accept-invite?token=abc123"),
    ).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("shows a refusal from the server inline, and offers no link", async () => {
    server.use(
      http.post(`${API}/users/invite`, () =>
        HttpResponse.json(
          { error: "That department already has an active head" },
          { status: 400 },
        ),
      ),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await within(main).findByText("Invite an account");

    await user.type(within(main).getByLabelText("Email"), "newhead@cncs.aau.edu.et");
    await user.selectOptions(await within(main).findByLabelText("Department"), "unit-phys");
    await user.type(within(main).getByLabelText("Authorized by"), "College Office");
    await user.type(within(main).getByLabelText("Authorization reference"), "CNCS/HR/2026/117");
    await user.click(within(main).getByRole("button", { name: "Send invite" }));

    // The server's own sentence, not a generic failure: it names the department
    // as the problem, which is the thing the administrator has to change.
    expect(await within(main).findByText(/already has an active head/)).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /copy link/i })).not.toBeInTheDocument();
  });

  it("refuses to submit a head invite with no department, before calling the API", async () => {
    let called = false;
    server.use(
      http.post(`${API}/users/invite`, () => {
        called = true;
        return HttpResponse.json({ error: "unreachable" }, { status: 500 });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await within(main).findByText("Invite an account");

    await user.type(within(main).getByLabelText("Email"), "newhead@cncs.aau.edu.et");
    await user.type(within(main).getByLabelText("Authorized by"), "College Office");
    await user.type(within(main).getByLabelText("Authorization reference"), "CNCS/HR/2026/117");
    await user.click(within(main).getByRole("button", { name: "Send invite" }));

    expect(
      await within(main).findByText(/Choose the department this head is being appointed to/),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
