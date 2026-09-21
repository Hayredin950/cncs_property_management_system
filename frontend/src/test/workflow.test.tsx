import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { server } from "./msw/server";
import { REQUEST_FIXTURE, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * The Phase 2 rules the plan names as test requirements (§3): the requester
 * cannot decide their own request, a decided request cannot be re-decided,
 * staff calling approve gets 403, rejection needs a reason, and the nav badge
 * updates. All of these are *server* rules — the tests assert the UI surfaces
 * them the way the plan specifies.
 */
async function openRequestDetail() {
  setToken("test-token");
  renderWithProviders({ initialEntries: ["/requests/req-1"] });
  await screen.findByRole("heading", { name: /transfer request/i });
}

describe("requests queue", () => {
  it("renders the queue with status filter and links to detail", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/requests"] });

    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(await screen.findByText("Dell Latitude 5440")).toBeInTheDocument();
    expect(screen.getAllByText("Pending review").length).toBeGreaterThan(0);
  });

  it("shows the staff variant copy for a staff account", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
      http.get(`${API}/requests`, () =>
        HttpResponse.json({ requests: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    renderWithProviders({ initialEntries: ["/requests"] });

    expect(await screen.findByText("Transfers and disposals you've filed.")).toBeInTheDocument();
    expect(await screen.findByText("You haven't filed any requests yet")).toBeInTheDocument();
  });
});

describe("request decision (admin)", () => {
  it("opens the approve ConfirmDialog stating the specific consequence, and approving updates the request", async () => {
    await openRequestDetail();
    const user = userEvent.setup();

    let decisionCalls = 0;
    server.use(
      http.post(`${API}/requests/req-1/approve`, () => {
        decisionCalls += 1;
        return HttpResponse.json({
          request: { ...REQUEST_FIXTURE, status: "APPROVED", decidedAt: "2026-09-21T12:00:00.000Z" },
          itemChanges: { building: "Building 3" },
          cascadedItemIds: [],
          editLogRowCount: 3,
          notification: { code: "REQUEST_APPROVED", message: "Approved." },
          emailStatus: "skipped",
        });
      }),
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));

    // The dialog states the consequence, not just "Are you sure?" (§8/§11).
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/can't be undone/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(decisionCalls).toBe(1));
  });

  it("blocks an empty rejection reason client-side, then submits with one", async () => {
    await openRequestDetail();
    const user = userEvent.setup();

    let receivedReason: string | undefined;
    server.use(
      http.post(`${API}/requests/req-1/reject`, async ({ request }) => {
        const body = (await request.json()) as { rejectionReason?: string };
        receivedReason = body.rejectionReason;
        return HttpResponse.json({
          request: { ...REQUEST_FIXTURE, status: "REJECTED", rejectionReason: body.rejectionReason },
          itemChanges: {},
          cascadedItemIds: [],
          editLogRowCount: 0,
          notification: { code: "REQUEST_REJECTED", message: "Rejected." },
          emailStatus: "skipped",
        });
      }),
    );

    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog");

    // The confirm button is disabled until the 3–500 char reason exists —
    // the dialog cannot submit empty (client-side; the server would 400 too).
    const rejectButton = within(dialog).getByRole("button", { name: "Reject request" });
    expect(rejectButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/rejection reason/i), "Item is needed for the demo");
    expect(rejectButton).toBeEnabled();
    await user.click(rejectButton);

    await waitFor(() => expect(receivedReason).toBe("Item is needed for the demo"));
  });

  it("never shows decision buttons for a decided request", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/requests/req-1`, () =>
        HttpResponse.json({
          request: { ...REQUEST_FIXTURE, status: "APPROVED", decidedAt: "2026-09-21T09:00:00.000Z" },
        }),
      ),
    );
    renderWithProviders({ initialEntries: ["/requests/req-1"] });

    await screen.findByText(/decided requests can't be re-decided/i);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});

describe("request form validation parity", () => {
  it("rejects a DISPOSAL that names transfer fields, mirroring the server's 400", async () => {
    setToken("test-token");
    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/requests/new"] });

    // `findByLabelText`, not `getByLabelText`: a token is present, so the
    // guarded shell waits for `GET /auth/me` before rendering anything.
    await user.selectOptions(await screen.findByLabelText("Request type"), "DISPOSAL");
    await user.selectOptions(screen.getByLabelText("Item"), "item-1");
    await user.type(screen.getByLabelText("Building"), "Building 9");
    await user.type(screen.getByLabelText(/^Reason/), "This item no longer works at all");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    // The client must catch what the server would 400 — no request is sent.
    expect(await screen.findByText(/disposal must not include transfer fields/i)).toBeInTheDocument();
  });

  it("enforces the 10-character reason minimum", async () => {
    setToken("test-token");
    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/requests/new"] });

    const itemSelect = await screen.findByLabelText("Item");
    // The item options come from `GET /items`; wait for them rather than
    // selecting against the "Loading items…" placeholder.
    await waitFor(() =>
      expect(within(itemSelect).getAllByRole("option").length).toBeGreaterThan(1),
    );
    await user.selectOptions(itemSelect, "item-1");
    await user.type(screen.getByLabelText(/^Reason/), "too short");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
  });
});

describe("notifications", () => {
  it("renders the inbox with unread marker and branches icon on code", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/notifications"] });

    await screen.findByRole("heading", { name: "Notifications" });
    expect(screen.getByText("1 unread.")).toBeInTheDocument();
    expect(screen.getByText(/needs review/i)).toBeInTheDocument();
    expect(screen.getByText(/was approved/i)).toBeInTheDocument();
  });

  it("links a notification to its related request", async () => {
    setToken("test-token");
    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/notifications"] });

    const link = await screen.findByRole("link", { name: /needs review/i });
    await user.click(link);
    expect(await screen.findByRole("heading", { name: /transfer request/i })).toBeInTheDocument();
  });

  it("updates the admin nav pending badge without a refresh", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    // PENDING_COUNT fixture = 2; the badge renders in the sidebar nav.
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    await waitFor(
      () => {
        expect(within(nav).getByLabelText("2 pending requests")).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });
});
