import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { server } from "./msw/server";
import { NOTIFICATIONS_LIST, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * Inbox housekeeping (F8.1): the X on a card, "Mark all as read", and "Clear
 * all" — plus the unread badge the sidebar carries for the same inbox.
 *
 * The handlers here are **stateful**, unlike the defaults in `msw/handlers.ts`.
 * That matters: every one of these actions is optimistic in the UI, so a test
 * that only watched the screen would pass against a page that removed a row
 * locally and had it reappear on the next refetch. Each test therefore asserts
 * the request that actually left *and* that the server's next read agrees with
 * what is on screen — the two halves that make the optimistic patch honest.
 *
 * The log is returned from `statefulInbox()` rather than reset per test, so the
 * third assertion in each test can be "and nothing else was called".
 */
function statefulInbox() {
  let rows = [...NOTIFICATIONS_LIST.notifications];
  const calls: string[] = [];

  server.use(
    http.get(`${API}/notifications`, () =>
      HttpResponse.json({
        ...NOTIFICATIONS_LIST,
        notifications: rows,
        // Derived from the rows, exactly as the API derives it. A hardcoded
        // number would let a page show a count that contradicts its own list.
        unreadCount: rows.filter((notification) => !notification.isRead).length,
      }),
    ),
    http.post(`${API}/notifications/read-all`, () => {
      calls.push("read-all");
      rows = rows.map((notification) => ({ ...notification, isRead: true }));
      return HttpResponse.json({ updated: rows.length });
    }),
    http.delete(`${API}/notifications/:id`, ({ params }) => {
      const id = String(params.id);
      calls.push(`dismiss:${id}`);
      rows = rows.filter((notification) => notification.id !== id);
      return HttpResponse.json({ id, deleted: true });
    }),
    http.delete(`${API}/notifications`, () => {
      calls.push("clear");
      rows = [];
      return HttpResponse.json({ deleted: 2 });
    }),
  );

  return calls;
}

/** Opens the inbox and waits for both fixture messages to be on screen. */
async function openInbox() {
  setToken("test-token");
  renderWithProviders({ initialEntries: ["/notifications"] });

  await screen.findByRole("heading", { name: "Notifications" });
  await screen.findByText(/needs review/i);
  await screen.findByText(/was approved/i);
}

describe("/notifications — dismiss one", () => {
  it("takes that message out of the list and leaves the other standing", async () => {
    const calls = statefulInbox();
    await openInbox();
    const user = userEvent.setup();

    // The label carries the message, so this cannot be the other row's X.
    await user.click(screen.getByRole("button", { name: /remove notification: .*needs review/i }));

    await waitFor(() => expect(screen.queryByText(/needs review/i)).not.toBeInTheDocument());
    expect(calls).toEqual(["dismiss:n-1"]);
    // One row went, not the list.
    expect(screen.getByText(/was approved/i)).toBeInTheDocument();
    // The dismissed row was the unread one, so the count goes with it.
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument();
  });
});

describe("/notifications — mark all as read", () => {
  it("zeroes the count without removing a single message", async () => {
    const calls = statefulInbox();
    await openInbox();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /mark all as read/i }));

    await waitFor(() => expect(screen.getByText("You're all caught up.")).toBeInTheDocument());
    expect(calls).toContain("read-all");
    // Read, not gone: both messages are still listed, and the unread marker has
    // left every card.
    expect(screen.getByText(/needs review/i)).toBeInTheDocument();
    expect(screen.getByText(/was approved/i)).toBeInTheDocument();
    expect(screen.queryAllByLabelText("Unread")).toHaveLength(0);
  });

  it("is disabled when nothing is unread, instead of hiding and reflowing the header", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/notifications`, () =>
        HttpResponse.json({
          ...NOTIFICATIONS_LIST,
          notifications: NOTIFICATIONS_LIST.notifications.map((notification) => ({
            ...notification,
            isRead: true,
          })),
          unreadCount: 0,
        }),
      ),
    );
    renderWithProviders({ initialEntries: ["/notifications"] });

    await screen.findByRole("heading", { name: "Notifications" });
    expect(await screen.findByRole("button", { name: /mark all as read/i })).toBeDisabled();
  });
});

describe("/notifications — clear all", () => {
  it("asks first, naming what goes, and only then empties the inbox", async () => {
    const calls = statefulInbox();
    await openInbox();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /clear all/i }));

    const dialog = await screen.findByRole("dialog", { name: /clear all notifications/i });
    // The consequence, with the number, and the reassurance that nothing else is
    // destroyed — a notification is a copy of a request/edit-log row, not a record.
    expect(within(dialog).getByText(/2 messages leave your inbox/i)).toBeInTheDocument();
    // Opening the question sends nothing.
    expect(calls).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: /clear all/i }));

    await waitFor(() => expect(screen.getByText("No notifications yet")).toBeInTheDocument());
    expect(calls).toEqual(["clear"]);
    // The bulk controls act on the list that no longer exists.
    expect(screen.queryByRole("button", { name: /mark all as read/i })).not.toBeInTheDocument();
  });

  it("leaves the inbox alone when the confirmation is cancelled", async () => {
    const calls = statefulInbox();
    await openInbox();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /clear all/i }));
    const dialog = await screen.findByRole("dialog", { name: /clear all notifications/i });
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /clear all notifications/i })).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([]);
    expect(screen.getByText(/needs review/i)).toBeInTheDocument();
  });
});

/**
 * The sidebar's Notifications badge — the same inbox, counted where the reader
 * sees it without opening the page. It is deliberately **not** role-gated the way
 * the review-queue badge is: the inbox belongs to whoever is signed in.
 */
describe("the Notifications nav badge", () => {
  it("shows the count the API reports, not a constant", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/notifications`, () => HttpResponse.json({ ...NOTIFICATIONS_LIST, unreadCount: 4 })),
    );
    renderWithProviders({ initialEntries: ["/dashboard"] });

    const nav = await screen.findByRole("navigation", { name: "Primary", hidden: true });
    await waitFor(() =>
      expect(within(nav).getByLabelText("4 unread notifications")).toBeInTheDocument(),
    );
    // The badge rides along with the destination; it never replaces the link.
    expect(within(nav).getByRole("link", { name: /notifications/i, hidden: true })).toBeInTheDocument();
  });

  it("shows the inbox to a staff account, whose queue counter is admin-only", async () => {
    setToken("test-token");
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })));
    renderWithProviders({ initialEntries: ["/dashboard"] });

    const nav = await screen.findByRole("navigation", { name: "Primary", hidden: true });
    await waitFor(() =>
      expect(within(nav).getByLabelText("1 unread notifications")).toBeInTheDocument(),
    );
    // PENDING_COUNT is 2, but the review queue is not a staff member's to watch.
    expect(within(nav).queryByLabelText(/pending requests/)).not.toBeInTheDocument();
  });

  it("drops away when the inbox is read from the page itself", async () => {
    const calls = statefulInbox();
    await openInbox();

    const nav = screen.getByRole("navigation", { name: "Primary", hidden: true });
    await waitFor(() =>
      expect(within(nav).getByLabelText("1 unread notifications")).toBeInTheDocument(),
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /mark all as read/i }));

    // Badge and list are separate cache entries; this is the assertion that they
    // are invalidated together rather than drifting apart.
    await waitFor(() =>
      expect(within(nav).queryByLabelText(/unread notifications/)).not.toBeInTheDocument(),
    );
    expect(calls).toContain("read-all");
  });
});
