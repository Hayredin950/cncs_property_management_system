import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ADMIN_USER } from "./fixtures";

/**
 * The hamburger drawer's visual language.
 *
 * The drawer is the one surface where the grouped `aauNav` menu tree (Work /
 * Audit / Admin) is flattened into a plain list beside the portal's own
 * destinations, so it is also the one place where the two navigation idioms meet
 * — and it had drifted: hairline-divided full-width rows, a flat grey identity
 * box, and two actions styled as if they were more menu rows.
 *
 * These assertions pin the three things a reviewer looks at and a screenshot
 * cannot check: every row leads with an icon from the same set the bottom tab bar
 * uses, the account block sits on a real card (`Card`'s own recipe), and the two
 * account actions are visually distinguishable from each other.
 *
 * Queries are scoped: the desktop sidebar and the header bar are both in the DOM
 * at once (jsdom does not apply `hidden lg:block`), so `Dashboard` and `Sign out`
 * each exist more than once on an authenticated page.
 */
async function openDrawer() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open menu" }));
  return user;
}

function drawerNav(): HTMLElement {
  return screen.getByRole("navigation", { name: "Mobile" });
}

/**
 * The account block's `<section>`, reached through the single email it renders —
 * the same anchor the `headerAccount` suite uses for the identity card.
 */
function accountSection(): HTMLElement {
  return screen.getByText(ADMIN_USER.email).closest("section") as HTMLElement;
}

describe("mobile drawer", () => {
  it("leads every destination with an icon, like the bottom tab bar", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    await openDrawer();

    // Home is a link and the grouped menus are accordion triggers; all four wear
    // the same leading icon, which is what stops the drawer from reading as a
    // list of bare text rows.
    const nav = drawerNav();
    expect(within(nav).getByRole("link", { name: "Home" }).querySelector("svg")).not.toBeNull();
    for (const label of ["Work", "Audit", "Admin"]) {
      expect(within(nav).getByRole("button", { name: label }).querySelector("svg")).not.toBeNull();
    }
  });

  it("opens an accordion in place and gives its links the same row shape", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    const user = await openDrawer();
    const nav = drawerNav();

    const work = within(nav).getByRole("button", { name: "Work" });
    expect(work).toHaveAttribute("aria-expanded", "false");

    await user.click(work);
    expect(within(nav).getByRole("button", { name: "Work" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    // The panel stays inside the drawer's card rather than escaping to full width,
    // and its headings keep the desktop menu's names.
    expect(within(nav).getByText("Assets")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "All items" })).toHaveClass("rounded-md");
  });

  it("puts the account on a card and keeps Sign out distinct from Dashboard", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    await openDrawer();

    const account = accountSection();
    // A labelled section is what makes the repeated `Dashboard` legible — it is
    // also the bottom bar's first tab, and for a signed-in user what the drawer's
    // own Home row points at.
    expect(within(account).getByRole("heading", { name: "Account" })).toBeInTheDocument();

    // The identity card, via its one email: `Card`'s recipe — `radius-md`, white,
    // `e1` — not the flat grey box it used to be.
    const identity = screen.getByText(ADMIN_USER.email).closest("div") as HTMLElement;
    expect(identity).toHaveClass("bg-white", "shadow-sm", "rounded-md");

    const dashboard = within(account).getByRole("button", { name: "Dashboard" });
    const signOut = within(account).getByRole("button", { name: "Sign out" });

    // Outlined navigation vs subdued-danger exit: two visibly different actions.
    expect(dashboard).toHaveClass("border-slate-300");
    expect(signOut).toHaveClass("text-danger-700");
    expect(signOut).not.toHaveClass("border-slate-300");
  });
});
