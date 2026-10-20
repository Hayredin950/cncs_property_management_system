import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../test/utils";
import { setToken } from "../../lib/storage";
import { STAFF_USER } from "../../test/fixtures";
import { http, HttpResponse } from "msw";
import { server } from "../../test/msw/server";

const API = "http://localhost:4000/api/v1";

describe("/dashboard", () => {
  it("shows the pending-review badge and the requests preview for an admin", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    // The count "2" appears in more than one place — the nav badge, the stat
    // card's pill and the number itself — so the number is looked for inside
    // the card that says "Pending review", not in the whole document.
    const main = await screen.findByRole("main");
    const pendingLabel = await within(main).findByText("Pending review");
    // The label and the number are siblings inside the card, so the card is
    // the label's grandparent. The count arrives with the query, so the
    // assertion waits for it rather than reading the placeholder.
    await waitFor(() => {
      const card = pendingLabel.parentElement?.parentElement;
      expect(card?.textContent).toContain("2");
    });
    // "Pending review" appears twice (stat label + request status chip) —
    // assert both render rather than a unique-text assertion.
    expect(screen.getAllByText("Pending review").length).toBeGreaterThanOrEqual(2);
    // Latest queue entry previews with the shared badge vocabulary.
    expect(await screen.findByText("Dell Latitude 5440")).toBeInTheDocument();
    expect(screen.getByText("Transfer")).toBeInTheDocument();
  });

  it("uses staff wording for a staff account", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
      http.get(`${API}/requests`, () => HttpResponse.json({ requests: [], total: 0, limit: 5, offset: 0 })),
    );
    renderWithProviders({ initialEntries: ["/dashboard"] });

    expect(await screen.findByText("Your recent requests")).toBeInTheDocument();
    expect(await screen.findByText("You haven't filed any requests yet")).toBeInTheDocument();
  });

  it("renders the empty queue state for an admin with no requests", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/requests`, () => HttpResponse.json({ requests: [], total: 0, limit: 5, offset: 0 })),
    );
    renderWithProviders({ initialEntries: ["/dashboard"] });

    expect(await screen.findByText("No pending requests")).toBeInTheDocument();
  });
});
