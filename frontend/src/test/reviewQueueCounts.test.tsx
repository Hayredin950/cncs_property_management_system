import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { setToken } from "../lib/storage";
import { reviewQueueStatuses } from "../lib/permissions";
import { HEAD_USER, OFFICER_USER, STAFF_USER } from "./fixtures";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import type { MeResponse } from "../types/user";

const API = "http://localhost:4000/api/v1";

/**
 * The review count and the list it opens have to answer the same question.
 *
 * `GET /requests/pending-count` counts every status that waits on the viewer's
 * decision — the initial `PENDING`, both transfer stages, and (for the office
 * that lends the item) a return confirmation. The dashboard tile, the dashboard
 * preview and the Requests screen used to ask for `PENDING` alone, so a
 * Department Head read a count that no list could reproduce and a Property
 * Officer's return handshake was invisible. These tests pin the set and the
 * hand-off between the screens.
 */
describe("review queue statuses", () => {
  it("gives the officer every deciding status, including the return handshake", () => {
    expect(reviewQueueStatuses("PROPERTY_OFFICER")).toBe(
      "PENDING,PENDING_STAGE1,PENDING_STAGE2,RETURN_PENDING_CONFIRMATION",
    );
  });

  it("gives a head the stages but not a loan return it cannot confirm", () => {
    expect(reviewQueueStatuses("DEPARTMENT_HEAD")).toBe("PENDING,PENDING_STAGE1,PENDING_STAGE2");
  });

  it("gives a staff member and the admin no review queue at all", () => {
    // The staff list is their own filings; the admin has no asset business.
    expect(reviewQueueStatuses("STAFF")).toBeUndefined();
    expect(reviewQueueStatuses("SYSTEM_ADMIN")).toBeUndefined();
    expect(reviewQueueStatuses(undefined)).toBeUndefined();
  });

  it("opens the same set the officer's tile counted", async () => {
    setToken("test-token");
    const seen: string[] = [];
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER } as MeResponse)),
      http.get(`${API}/requests`, ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        if (status) seen.push(status);
        return HttpResponse.json({ requests: [], total: 0, limit: 5, offset: 0 });
      }),
    );

    renderWithProviders({ initialEntries: ["/dashboard"] });

    // Several tiles carry a "View all"; the request card's is the one that
    // points into the queue.
    const links = await screen.findAllByRole("link", { name: /view all/i });
    const link = links.find((row) => row.getAttribute("href")?.startsWith("/requests"));
    expect(link).toBeTruthy();
    const href = new URL(link?.getAttribute("href") ?? "", "http://localhost");
    expect(href.pathname).toBe("/requests");
    expect(href.searchParams.get("status")).toBe(
      "PENDING,PENDING_STAGE1,PENDING_STAGE2,RETURN_PENDING_CONFIRMATION",
    );
    await waitFor(() =>
      expect(seen).toContain(
        "PENDING,PENDING_STAGE1,PENDING_STAGE2,RETURN_PENDING_CONFIRMATION",
      ),
    );
  });

  it("opens the head's narrower set, never the return status", async () => {
    setToken("test-token");
    const seen: string[] = [];
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: HEAD_USER } as MeResponse)),
      http.get(`${API}/requests`, ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        if (status) seen.push(status);
        return HttpResponse.json({ requests: [], total: 0, limit: 5, offset: 0 });
      }),
    );

    renderWithProviders({ initialEntries: ["/dashboard"] });

    const links = await screen.findAllByRole("link", { name: /view all/i });
    const link = links.find((row) => row.getAttribute("href")?.startsWith("/requests"));
    expect(link).toBeTruthy();
    const href = new URL(link?.getAttribute("href") ?? "", "http://localhost");
    expect(href.searchParams.get("status")).toBe("PENDING,PENDING_STAGE1,PENDING_STAGE2");
    await waitFor(() => expect(seen).toContain("PENDING,PENDING_STAGE1,PENDING_STAGE2"));
    expect(seen).not.toContain(
      "PENDING,PENDING_STAGE1,PENDING_STAGE2,RETURN_PENDING_CONFIRMATION",
    );
  });

  it("keeps the set selected on the Requests screen it opens", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER } as MeResponse)),
      http.get(`${API}/requests`, () =>
        HttpResponse.json({ requests: [], total: 0, limit: 20, offset: 0 }),
      ),
    );

    const set = "PENDING,PENDING_STAGE1,PENDING_STAGE2,RETURN_PENDING_CONFIRMATION";
    renderWithProviders({ initialEntries: [`/requests?status=${encodeURIComponent(set)}`] });

    const main = await screen.findByRole("main");
    const status = (await within(main).findByLabelText("Status")) as HTMLSelectElement;
    // Parsed as a set rather than dropped to "All statuses" — dropping it would
    // open a wider list than the tile counted.
    expect(status.value).toBe(set);
    expect(within(main).getByRole("option", { name: "Needs review" })).toBeInTheDocument();
  });

  it("does not offer a review queue to a staff member", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER } as MeResponse)),
      http.get(`${API}/requests`, () =>
        HttpResponse.json({ requests: [], total: 0, limit: 20, offset: 0 }),
      ),
    );

    renderWithProviders({ initialEntries: ["/requests"] });

    const main = await screen.findByRole("main");
    expect(within(main).queryByRole("option", { name: "Needs review" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: "Needs review" })).not.toBeInTheDocument();
  });
});
