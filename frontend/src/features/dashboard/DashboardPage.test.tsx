import { screen } from "@testing-library/react";
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

    const badge = await screen.findByText("2");
    expect(badge).toBeInTheDocument();
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

    expect(await screen.findByText("Pending requests")).toBeInTheDocument();
    expect(await screen.findByText("You haven't filed any requests yet")).toBeInTheDocument();
  });

  it("renders the empty queue state for an admin with no requests", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/requests`, () => HttpResponse.json({ requests: [], total: 0, limit: 5, offset: 0 })),
    );
    renderWithProviders({ initialEntries: ["/dashboard"] });

    expect(await screen.findByText("No requests yet")).toBeInTheDocument();
  });
});
