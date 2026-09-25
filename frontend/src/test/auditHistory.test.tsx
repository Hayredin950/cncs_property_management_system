import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import {
  AUDITS_LIST,
  AUDIT_READBACK,
  AUDIT_SESSION,
  AUDIT_STORED_ROWS,
  PRIVILEGED_ITEM,
} from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * Audits are written to the database as they happen — every scan on the way
 * through, the classifications at completion. What was missing was any way to
 * *find* one afterwards: a session id was the only handle, and nothing in the app
 * ever showed one, so a stored audit was unreachable. "It doesn't get persisted"
 * is what that feels like from the outside.
 *
 * These tests cover the two halves of the fix: a history that lists sessions with
 * their timestamps and counts, and a walkthrough that reads stored rows back
 * instead of trusting one tab's `sessionStorage`.
 */
describe("/audits — the audit history", () => {
  it("lists stored sessions with their counts, status and a link to the report", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/audits"] });

    expect(await screen.findByRole("heading", { name: "Audits" })).toBeInTheDocument();

    // The finished session links to its report by id — the handle that used to be
    // the only way in, now handed out by the list.
    const completed = await screen.findByRole("link", { name: "Computer Science" });
    expect(completed).toHaveAttribute("href", `/audit/${AUDIT_SESSION.id}/report`);
    expect(screen.getByText(/Completed/)).toBeInTheDocument();

    // The unfinished one is listed too, and says so rather than looking finished.
    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();

    // Counts are the server's, and scoped to the row so a nav badge showing the
    // same digit can't satisfy the assertion.
    const completedRow = completed.closest("li") as HTMLElement;
    expect(within(completedRow).getByText("3")).toBeInTheDocument();
    expect(within(completedRow).getByText("2")).toBeInTheDocument();
    expect(within(completedRow).getByText("1")).toBeInTheDocument();

    expect(within(completedRow).getByRole("button", { name: /csv/i })).toBeInTheDocument();
  });

  it("offers to start an audit when there is no history yet", async () => {
    server.use(
      http.get(`${API}/audits`, () =>
        HttpResponse.json({ audits: [], total: 0, limit: 20, offset: 0 }),
      ),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/audits"] });

    expect(await screen.findByText("No audits yet")).toBeInTheDocument();
    // Both entry points to `/audit/new` — the header action and the empty state's.
    for (const link of screen.getAllByRole("link", { name: /start an audit/i })) {
      expect(link).toHaveAttribute("href", "/audit/new");
    }
  });

  it("lets an admin narrow the list to their own audits", async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${API}/audits`, ({ request }) => {
        urls.push(new URL(request.url).search);
        return HttpResponse.json(AUDITS_LIST);
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/audits"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Audits" });
    await user.selectOptions(screen.getByLabelText("Show"), "1");

    // The filter is server-side, and `mine` narrows rather than replaces the scope.
    await waitFor(() => expect(urls.at(-1)).toContain("mine=true"));
  });
});

describe("audit walkthrough — stored scans", () => {
  it("lists scans the server already has when the tab is new", async () => {
    server.use(
      http.get(`${API}/audits/:id`, () =>
        HttpResponse.json(AUDIT_READBACK(AUDIT_SESSION.id, { rows: AUDIT_STORED_ROWS })),
      ),
    );

    setToken("test-token");
    // No `saveWalkthrough` call: `sessionStorage` is cleared between tests, so this
    // is the new-tab case that used to render an empty list.
    renderWithProviders({ initialEntries: [`/audit/${AUDIT_SESSION.id}/scan`] });

    expect(await screen.findByText(PRIVILEGED_ITEM.name)).toBeInTheDocument();
    // Scanned, but in the wrong place — still a scan this walk made.
    expect(screen.getByText("Misplaced Projector")).toBeInTheDocument();
    // Never scanned at all: a completion-time classification, not a scan.
    expect(screen.queryByText("Missing Monitor")).not.toBeInTheDocument();
  });

  it("won't offer to complete a session the server already completed", async () => {
    server.use(
      http.get(`${API}/audits/:id`, () =>
        HttpResponse.json(
          AUDIT_READBACK(AUDIT_SESSION.id, {
            rows: AUDIT_STORED_ROWS,
            completed: true,
            completedAt: "2026-09-22T08:30:00.000Z",
          }),
        ),
      ),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: [`/audit/${AUDIT_SESSION.id}/scan`] });

    expect(await screen.findByText(/can't be scanned into any more/i)).toBeInTheDocument();
    // The server answers 409 to a second completion, so the button is replaced
    // rather than left enabled to fail.
    expect(screen.getByRole("button", { name: "Complete audit" })).toBeDisabled();
  });
});
