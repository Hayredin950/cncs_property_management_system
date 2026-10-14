import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ITEMS_LIST, OFFICER_USER, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * `/items` is one URL with two readings, and the page must say which one the
 * viewer is getting.
 *
 * The server scopes the list, not the client (`backend/src/services/itemScope.ts`):
 * a Property Officer gets the college, a Staff member gets only what they hold.
 * The page used to describe itself as "Browse items · search the active
 * inventory" for everybody and show "No items registered yet" when its (scoped,
 * therefore empty) list came back — so a Staff member clicking the header's "All
 * items" was told the register was empty, while the same data one query parameter
 * away showed their items. The data was right; the copy made it look broken.
 *
 * These two cases are the whole bug: which words a scoped viewer gets, and that an
 * unscoped viewer still gets the register's words.
 */

describe("/items tells the viewer which list they are looking at", () => {
  it("frames the list as their own for a Staff member, with an honest empty state", async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
      http.get(`${API}/items`, () => HttpResponse.json(ITEMS_LIST([]))),
      http.get(`${API}/categories`, () => HttpResponse.json([])),
    );
    setToken("test-token");

    renderWithProviders({ initialEntries: ["/items"] });

    /*
      Wait for the *workbench* shell before asserting anything.

      `SmartLayout` renders the public shell while the stored token rehydrates,
      then swaps to `AppLayout` when `/auth/me` answers — the same URL, two
      different trees. `main` is not enough to tell them apart (both shells have
      one), and a heading found before the swap is detached by it, which is how
      an assertion can fail on an element the query just returned. The sidebar's
      `navigation[aria-label="Primary"]` exists only in `AppLayout`, so waiting on
      it means the render that decides `isScoped` has already happened.
    */
    await screen.findByRole("navigation", { name: "Primary" });
    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { name: "My items" })).toBeInTheDocument();
    // The lie the new copy replaced: "the register is empty" is not what an empty
    // scoped list means, and it is not what the user was being shown.
    expect(within(main).getByText(/Nothing is assigned to you yet/)).toBeInTheDocument();
    expect(within(main).queryByText("No items registered yet")).not.toBeInTheDocument();
    expect(within(main).queryByRole("heading", { name: "Browse items" })).not.toBeInTheDocument();
  });

  it("still frames it as the register for the Property Officer", async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER })),
      http.get(`${API}/items`, () => HttpResponse.json(ITEMS_LIST([]))),
      http.get(`${API}/categories`, () => HttpResponse.json([])),
    );
    setToken("test-token");

    renderWithProviders({ initialEntries: ["/items"] });

    await screen.findByRole("navigation", { name: "Primary" });
    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { name: "Browse items" })).toBeInTheDocument();
    expect(within(main).getByText("No items registered yet")).toBeInTheDocument();
    expect(within(main).queryByRole("heading", { name: "My items" })).not.toBeInTheDocument();
  });
});
