import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ADMIN_USER } from "./fixtures";

/**
 * The hamburger used to open a different menu depending on the page.
 *
 * `PublicLayout` (landing, map, login, `*`) put a Dashboard button in the bar and a
 * name + role chip + Dashboard + Sign out in the drawer. `AppLayout` — the
 * workbench, i.e. most of the app — put the bare name in the bar and **nothing** in
 * the drawer: no account section, no sign out, no indication of who was signed in.
 * So the same control offered different things on `/` and on `/dashboard`, which
 * reads as a bug because it is one.
 *
 * The assertions below are deliberately *identical* for both shells: that is the
 * property being protected. Both roots now render the same
 * `HeaderAccountBlock` in both positions.
 */
async function openDrawer() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open menu" }));
  return user;
}

/** The drawer's identity card — the only place the account's email is rendered. */
function identityCard(): HTMLElement {
  return screen.getByText(ADMIN_USER.email).closest("div") as HTMLElement;
}

describe("header account block", () => {
  it.each(["/", "/dashboard"])("shows the same account section in the drawer on %s", async (route) => {
    setToken("test-token");
    renderWithProviders({ initialEntries: [route] });

    await openDrawer();

    expect(within(identityCard()).getByText(ADMIN_USER.fullName)).toBeInTheDocument();
    expect(within(identityCard()).getByText("Admin")).toBeInTheDocument();

    // One control in the bar (`Dashboard`) plus the drawer's own full-width one.
    expect(screen.getAllByRole("button", { name: "Dashboard" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
  });

  it("offers an anonymous visitor a sign-in path instead of an empty drawer", async () => {
    renderWithProviders({ initialEntries: ["/"] });

    await openDrawer();

    expect(screen.getByText(/sign in to manage the register/i)).toBeInTheDocument();
    // One control in the bar plus the drawer's own full-width one — the same
    // "one in the bar, the rest in the drawer" shape as the signed-in state.
    expect(screen.getAllByRole("button", { name: "Sign in" })).toHaveLength(2);
    // No account chrome leaks to a visitor with no account.
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });
});
