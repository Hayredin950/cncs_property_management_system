import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { OFFICER_USER, REQUEST_DETAIL_FIXTURE, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * The request screen's decision surface.
 *
 * Two things are under test, and both were missing:
 *
 *   - **a two-stage transfer must not look like one approval.** Stage 1 (the
 *     releasing head) does *not* move the item; stage 2 (the receiving head)
 *     does. One generic "Approve" button and one generic warning made the two
 *     indistinguishable, so an approver could agree to a handover without
 *     knowing that was what they were agreeing to.
 *   - **the loan return handshake had no screen at all.** The three endpoints
 *     existed; nobody could use them.
 */
function requestWith(overrides: Record<string, unknown>) {
  return { ...REQUEST_DETAIL_FIXTURE, ...overrides };
}

describe("/requests/:id — the decision surface", () => {
  beforeEach(() => {
    setToken("test-token");
  });

  it("says stage 1 is a release, and does not move the item", async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER })),
      http.get(`${API}/requests/req-1`, () =>
        HttpResponse.json({ request: requestWith({ status: "PENDING_STAGE1", type: "TRANSFER" }) }),
      ),
    );
    renderWithProviders({ initialEntries: ["/requests/req-1"] });
    const user = userEvent.setup();

    const approve = await screen.findByRole("button", { name: /Approve stage 1/i });
    await user.click(approve);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/releasing/i, { exact: false }),
    ).toBeInTheDocument();
    // The stage-1 warning says, in words, that the item does not move yet.
    // (The sentence is broken up by a <strong>, so the assertion reads the
    // dialog's text rather than matching across elements.)
    expect(dialog.textContent).toMatch(/does\s+not\s+move/i);
    expect(within(dialog).getByRole("button", { name: /Approve stage 1/i })).toBeInTheDocument();
  });

  it("says stage 2 is the handover, and that it moves the item", async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER })),
      http.get(`${API}/requests/req-1`, () =>
        HttpResponse.json({ request: requestWith({ status: "PENDING_STAGE2", type: "TRANSFER" }) }),
      ),
    );
    renderWithProviders({ initialEntries: ["/requests/req-1"] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Approve stage 2/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/receiving/i, { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText(/moves/i, { exact: false })).toBeInTheDocument();
  });

  it("lets the borrower say they are handing a loaned item back", async () => {
    let initiated = false;
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
      http.get(`${API}/requests/req-1`, () =>
        HttpResponse.json({
          request: requestWith({
            type: "LOAN",
            status: "APPROVED",
            loanDueDate: "2026-12-01T00:00:00.000Z",
            loanReturnedAt: null,
          }),
        }),
      ),
      http.post(`${API}/requests/req-1/return-initiate`, () => {
        initiated = true;
        return HttpResponse.json({ request: requestWith({ status: "RETURN_PENDING_CONFIRMATION" }) });
      }),
    );
    renderWithProviders({ initialEntries: ["/requests/req-1"] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /handing it back/i }));

    await waitFor(() => expect(initiated).toBe(true));
  });

  it("lets the lender confirm a return, and refuses to do it without a condition", async () => {
    let confirmed: { condition: string } | null = null;
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER })),
      http.get(`${API}/requests/req-1`, () =>
        HttpResponse.json({
          request: requestWith({
            type: "LOAN",
            status: "RETURN_PENDING_CONFIRMATION",
            loanDueDate: "2026-12-01T00:00:00.000Z",
          }),
        }),
      ),
      http.post(`${API}/requests/req-1/return-confirm`, async ({ request }) => {
        confirmed = (await request.json()) as { condition: string };
        return HttpResponse.json({ requestId: "req-1", itemId: "item-1" });
      }),
    );
    renderWithProviders({ initialEntries: ["/requests/req-1"] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /confirm it came back/i }));

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /confirm the return/i });
    // No condition recorded yet — the button says so rather than sending a
    // blank condition to the server.
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/condition on return/i), "Good, as lent");
    await user.click(within(dialog).getByRole("button", { name: /confirm the return/i }));

    await waitFor(() => expect(confirmed?.condition).toBe("Good, as lent"));
  });
});
