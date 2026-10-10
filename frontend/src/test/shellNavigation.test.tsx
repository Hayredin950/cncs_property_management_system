import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import {
  clearToken,
  getSidebarCollapsed,
  setSidebarCollapsed,
  setToken,
} from "../lib/storage";
import { PRIVILEGED_ITEM, PUBLIC_ITEM } from "./fixtures";

/**
 * The sidebar is the workbench's anchor — it carries the destinations, the
 * review-queue badge, the API health indicator and Sign out. Two things used to
 * take it away from a signed-in user, and these tests pin both fixes:
 *
 *   1. **Following a nav link, or being redirected.** `/items`, `/scan` and
 *      `/item/:tagId` were public routes, so clicking either sidebar entry —
 *      and, worse, *saving an item*, which sends a signed-in user straight to
 *      the QR destination — left the app shell entirely: no nav, no badge, no
 *      way back but the browser's Back button. The shell now follows the
 *      *session* (`SmartLayout`), not the path.
 *   2. **Scrolling.** The rail was in normal flow, so a long register table
 *      carried it off the top of the viewport. It is sticky now, and it folds to
 *      an icon rail instead of disappearing.
 *
 * Queries here are deliberately visibility-agnostic (`getByText`, or
 * `getByRole(..., { hidden: true })`). The rail is `hidden lg:block` and jsdom
 * both applies that CSS and reports a 1024px viewport, so a visibility-respecting
 * query would be testing jsdom's layout rather than the component.
 */

/** Present only in the desktop rail's title strip. */
function sidebarPanel() {
  return screen.queryByText("Navigation");
}

/**
 * The desktop rail's landmark. Distinct from the mobile tab bar's, which is
 * `aria-label="Mobile primary"` — so this cannot resolve to the wrong shell.
 */
function rail() {
  return screen.getByRole("navigation", { name: "Primary", hidden: true });
}

function toggle() {
  return screen.getByRole("button", { name: /(collapse|expand) navigation/i, hidden: true });
}

describe("workbench shell", () => {
  it("keeps the sidebar when a signed-in user opens the public /scan page", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/scan"] });

    // Order matters. A stored token means Shell A paints first (`status` is
    // "loading" until `/auth/me` answers — guessing "staff" from the token's
    // mere presence is what `AuthContext` exists to prevent), so the shell
    // *replaces* itself once auth resolves. Waiting for the rail first means
    // the page assertion below runs against the settled tree, not against a
    // node React has already unmounted.
    expect(await screen.findByText("Navigation")).toBeInTheDocument();

    // The page still renders — this is a chrome change, not a route change.
    expect(screen.getByRole("heading", { name: "Scan a tag" })).toBeInTheDocument();
  });

  it("keeps the sidebar when the Items tab is followed from the shell", async () => {
    setToken("test-token");
    const user = userEvent.setup();
    const { router } = renderWithProviders({ initialEntries: ["/dashboard"] });

    expect(await screen.findByText("Navigation")).toBeInTheDocument();

    // Click *inside the rail*, not a header/mobile link with the same label.
    await user.click(within(rail()).getByText("Items"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/items"));
    expect(await screen.findByRole("heading", { name: "Browse items" })).toBeInTheDocument();
    expect(sidebarPanel()).toBeInTheDocument();
  });

  it("still gives an anonymous visitor the public shell on /scan", async () => {
    clearToken();
    renderWithProviders({ initialEntries: ["/scan"] });

    expect(await screen.findByRole("heading", { name: "Scan a tag" })).toBeInTheDocument();
    // No workbench chrome for someone without an account...
    expect(sidebarPanel()).not.toBeInTheDocument();
    // ...and the public header's own call to action is what they get instead.
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("keeps the sidebar when a signed-in user lands on the QR destination", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });

    // Same ordering rule as the /scan case: wait for the rail first, so auth has
    // resolved and the shell has settled, then assert the page.
    expect(await screen.findByText("Navigation")).toBeInTheDocument();

    // The record still renders — this is a chrome change, not a route change.
    expect(
      await screen.findByRole("heading", { name: PRIVILEGED_ITEM.name }),
    ).toBeInTheDocument();
  });

  it("still gives an anonymous visitor the public shell on the QR destination", async () => {
    clearToken();
    renderWithProviders({ initialEntries: [`/item/${PUBLIC_ITEM.tagId}`] });

    expect(
      await screen.findByRole("heading", { name: PUBLIC_ITEM.name }),
    ).toBeInTheDocument();
    // A QR scan by a member of the public must not reveal staff chrome.
    expect(sidebarPanel()).not.toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("folds the rail to an icon rail, keeping every destination reachable", async () => {
    setToken("test-token");
    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/dashboard"] });

    expect(await screen.findByText("Navigation")).toBeInTheDocument();
    await user.click(toggle());

    // Folded: the title strip is gone...
    expect(sidebarPanel()).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand navigation", hidden: true }),
    ).toBeInTheDocument();
    // ...but each destination keeps its accessible name (`sr-only`, not a
    // conditional render), so the nav is still operable and still announced.
    expect(within(rail()).getByText("Items")).toBeInTheDocument();
    expect(within(rail()).getByRole("link", { name: "Scan", hidden: true })).toBeInTheDocument();
    expect(getSidebarCollapsed()).toBe(true);
  });

  it("starts folded when the preference was left folded", async () => {
    setToken("test-token");
    // Written directly rather than by clicking: what's under test is that the
    // stored preference is *read* on mount, which is the reload path.
    setSidebarCollapsed(true);
    renderWithProviders({ initialEntries: ["/dashboard"] });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Expand navigation", hidden: true }),
      ).toBeInTheDocument(),
    );
    expect(sidebarPanel()).not.toBeInTheDocument();
  });
});
