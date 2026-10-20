import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import {
  OFFICER_ACCOUNT,
  PENDING_ACCOUNT,
  STAFF_ACCOUNT,
  STAFF_USER,
  SYSTEM_ADMIN_USER,
} from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * `/admin/users` — the accounts screen (F1.3).
 *
 * Two things are under test beyond "it renders": the role boundary (the screen
 * belongs to the System Admin — spec 2.1.1 — and hiding the nav link is not a
 * boundary), and the role change, which is asserted **through the wire**: the
 * request's `{ role }` body is the only evidence that the confirmation the
 * administrator read is the change that was actually sent.
 */

/**
 * Open the "Waiting for Approval" tab.
 *
 * The screen has three tabs (queue, invite, accounts). A System Admin lands
 * on the account list — that is where their work is — so a test that is about
 * the queue has to go and get it, the same way a person would.
 */
async function openApprovalsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Waiting for Approval/ }));
}

describe("/admin/users — the accounts screen", () => {
  // Every case below starts as the System Admin, because that is the only role
  // that can reach this screen at all. The token alone decides nothing — the app
  // resolves the session through `GET /auth/me`.
  beforeEach(() => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: SYSTEM_ADMIN_USER })),
    );
  });

  it("lists every account with its item count", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    expect(await screen.findByRole("heading", { name: "Accounts" })).toBeInTheDocument();
    // Scoped to the page body: the signed-in administrator's own name also appears
    // in the navigation panel, so a document-wide text query would match twice.
    const main = await screen.findByRole("main");
    expect(await within(main).findByText(OFFICER_ACCOUNT.fullName)).toBeInTheDocument();
    expect(within(main).getByText(STAFF_ACCOUNT.fullName)).toBeInTheDocument();
    // The count is the column that tells an administrator whether an account is
    // part of the record before they try to remove it.
    expect(within(main).getByText(/3 items/)).toBeInTheDocument();
    // Two accounts own nothing — the officer's row is the one with a count.
    expect(within(main).getAllByText(/No items/).length).toBeGreaterThan(1);
    // Role is shown per row, by name — the five roles differ in what they may do,
    // so "Property Officer" and "Staff" have to be legible in the list. Scoped to
    // the row: the create form's role picker carries the same two words.
    const officerRow = within(main).getByText(OFFICER_ACCOUNT.fullName).closest("li") as HTMLElement;
    expect(within(officerRow).getByText("Property Officer")).toBeInTheDocument();
    const staffRow = within(main).getByText(STAFF_ACCOUNT.fullName).closest("li") as HTMLElement;
    expect(within(staffRow).getByText("Staff")).toBeInTheDocument();
  });

  it("changes a role only after picking it and confirming the access it grants", async () => {
    let body: unknown = null;
    let changedId: string | null = null;
    server.use(
      http.post(`${API}/users/:id/promote`, async ({ params, request }) => {
        changedId = params.id as string;
        body = await request.json();
        return HttpResponse.json({ ...STAFF_ACCOUNT, role: "PROPERTY_OFFICER" });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    // The picker is a deliberate second step: it is opened explicitly, so a role
    // change is never one mis-click in a profile form.
    await user.click(
      await screen.findByRole("button", { name: `Change role for ${STAFF_USER.fullName}` }),
    );
    await user.selectOptions(await screen.findByLabelText("New role"), "PROPERTY_OFFICER");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Nothing has been sent yet — the confirmation is what sends it.
    expect(body).toBeNull();
    expect(await screen.findByText(/becomes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set role to Property Officer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set role to Property Officer" }));

    await waitFor(() => expect(changedId).toBe(STAFF_USER.id));
    expect(body).toEqual({ role: "PROPERTY_OFFICER" });
  });

  it("warns about the sessions a role change ends before it is sent", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: `Change role for ${STAFF_USER.fullName}` }),
    );
    await user.selectOptions(await screen.findByLabelText("New role"), "SYSTEM_ADMIN");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Naming the consequence instead of "Are you sure?" (§11 copy bank): the new
    // role, that it is administrator access, and that old sessions end with it.
    expect(await screen.findByText(/full administrator access/)).toBeInTheDocument();
    expect(screen.getByText(/every session this account is signed into ends/)).toBeInTheDocument();
  });

  it("never offers the acting administrator a way to change their own role", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    const own = await screen.findByRole("button", { name: /you cannot change your own role/i });
    expect(own).toBeDisabled();
  });

  it("never offers the acting administrator a way to delete themselves", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    const own = await screen.findByRole("button", { name: /you cannot delete your own account/i });
    expect(own).toBeDisabled();
  });

  it("never offers to set another person's password, and sends a reset link instead", async () => {
    // The rule (workflow spec §10.2) is absolute: no administrator, of any
    // role, ever sees or sets a password they do not own. The old screen had a
    // "Change password" dialog for exactly that — and no button ever opened
    // it, which is why it survived. The recovery path is a single-use link to
    // the account's own address.
    let body: unknown = null;
    server.use(
      http.post(`${API}/auth/request-password-reset`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: "If that address has an account, a link is on its way." });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: `Send a password reset link to ${STAFF_USER.email}`,
      }),
    );

    // The dialog asks for no password at all.
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change password" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(body).toEqual({ email: STAFF_USER.email }));
    expect(
      await screen.findByText(/A password reset link has been sent to/i),
    ).toBeInTheDocument();
  });

  it("is not reachable by a staff account at all", async () => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })));
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    // The same 404 an unknown path renders — there is no "forbidden" page.
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Accounts" })).not.toBeInTheDocument();
  });

  it("is not reachable by a Property Officer either, even though it may read accounts", async () => {
    // `USER_READ` is not `ACCOUNT_MANAGE` (spec 2.1.1): the officer sees the
    // account list where a picker needs it, and no administration screen.
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_ACCOUNT })));
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });

    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("puts the pending approval queue first, ahead of the privileged-invite form", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();
    await openApprovalsTab(user);

    const main = await screen.findByRole("main");
    expect(await within(main).findByText(/Waiting for Approval/i)).toBeInTheDocument();
    expect(within(main).getByText(PENDING_ACCOUNT.fullName)).toBeInTheDocument();
    expect(within(main).getByText(PENDING_ACCOUNT.email)).toBeInTheDocument();
    expect(within(main).getByText(/Requested/)).toBeInTheDocument();

    // The queue comes before the invite form (T6) so waiting people are not
    // buried under the form an administrator uses for privileged appointments.
    // They are separate tabs now, so the order that matters is the order of the
    // tabs themselves.
    const waiting = within(main).getByRole("button", { name: /Waiting for Approval/i });
    const invite = within(main).getByRole("button", { name: /Invite an Account/i });
    expect(
      waiting.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("approves a pending account with the chosen role in the body", async () => {
    let body: unknown = null;
    let approvedId: string | null = null;
    server.use(
      http.post(`${API}/users/:id/approve`, async ({ params, request }) => {
        approvedId = params.id as string;
        body = await request.json();
        return HttpResponse.json({
          ...PENDING_ACCOUNT,
          accountStatus: "ACTIVE",
          role: "AUDITOR",
          reviewedAt: "2026-09-16T12:00:00.000Z",
        });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();
    await openApprovalsTab(user);
    await openApprovalsTab(user);

    const main = await screen.findByRole("main");
    const row = (await within(main).findByText(PENDING_ACCOUNT.fullName)).closest(
      "li",
    ) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Role"), "AUDITOR");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approvedId).toBe(PENDING_ACCOUNT.id));
    expect(body).toEqual({ role: "AUDITOR" });
  });

  it("rejects a pending account only with a reason in the body", async () => {
    let body: unknown = null;
    let rejectedId: string | null = null;
    server.use(
      http.post(`${API}/users/:id/reject`, async ({ params, request }) => {
        rejectedId = params.id as string;
        body = await request.json();
        return HttpResponse.json({
          ...PENDING_ACCOUNT,
          accountStatus: "REJECTED",
          reviewedAt: "2026-09-16T12:00:00.000Z",
          reviewNote: "Not a campus staff member.",
        });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();
    await openApprovalsTab(user);

    const main = await screen.findByRole("main");
    const row = (await within(main).findByText(PENDING_ACCOUNT.fullName)).closest(
      "li",
    ) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Reject" }));

    const dialog = await screen.findByRole("dialog");
    // Empty reason keeps the confirm disabled — the reason is required.
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Rejection reason/), "Not a campus staff member.");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(rejectedId).toBe(PENDING_ACCOUNT.id));
    expect(body).toEqual({ reason: "Not a campus staff member." });
  });

  it("never offers Approve or Reject on the acting administrator's own pending row", async () => {
    // The queue can theoretically include the caller's own id; the UI hides the
    // actions as a courtesy — the server still refuses with assertCanReview.
    const ownPending = {
      ...SYSTEM_ADMIN_USER,
      itemCount: 0,
      accountStatus: "PENDING_APPROVAL" as const,
      reviewedAt: null,
      reviewNote: null,
    };
    server.use(http.get(`${API}/users/approvals`, () => HttpResponse.json([ownPending])));

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/users"] });
    const user = userEvent.setup();
    await openApprovalsTab(user);

    const main = await screen.findByRole("main");

    // "Abebe Admin" also appears in the Existing accounts list below, so find the
    // queue row through the message only its own pending row shows — that text
    // uniquely identifies the queue's own-row card.
    const row = (
      await within(main).findByText(/You cannot approve your own account/)
    ).closest("li") as HTMLElement;
    expect(within(row).getByText(ownPending.fullName)).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});
