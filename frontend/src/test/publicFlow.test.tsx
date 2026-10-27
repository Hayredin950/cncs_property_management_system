import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import { clearToken, setToken } from "../lib/storage";

const OFFICER_EMAIL = "officer@cncs.aau.edu.et";
const OFFICER_PASSWORD = "Officer123!";

/**
 * The register is internal: `GET /items` and `GET /items/:tagId` require a token
 * (no anonymous fallback since 15 Oct).
 *
 * These tests used to run the browse and scan flows with no token and a mocked
 * API that answered anyway, so the public journey looked healthy in the suite
 * while the deployment answered every visitor with 401 — and a signed-out tab
 * left on `/items` fetched a register it had no credential for. They now assert
 * the gate the deployment actually has, and that signing in returns the visitor
 * to the address they asked for.
 */
describe("the register is behind sign-in", () => {
  it("sends an anonymous visitor from /items to sign in, then back to the results", async () => {
    clearToken();
    const user = userEvent.setup();
    const { router } = renderWithProviders({ initialEntries: ["/items"] });

    // A guarded route, not an anonymous fetch that fails after the fact.
    expect(await screen.findByText("Staff sign in")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toContain("next=%2Fitems");

    await user.type(screen.getByLabelText("Email"), OFFICER_EMAIL);
    await user.type(screen.getByLabelText("Password"), OFFICER_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const searchBox = await screen.findByRole("searchbox");
    // The `next` the guard carried survived the round trip: this is the register,
    // not the dashboard the sign-in form defaults to.
    expect(router.state.location.pathname).toBe("/items");

    await user.type(searchBox, "AB12CD34");
    // Filter state lives in the URL (shareable, back/forward-friendly) — assert
    // the router's location itself, not just the rendered list.
    await waitFor(() => {
      expect(router.state.location.search).toContain("search=AB12CD34");
    });

    const main = screen.getByRole("main");
    const cards = await within(main).findAllByText("Dell Latitude 5440");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("shows the filtered empty state, distinct from 'no items yet', when nothing matches", async () => {
    setToken("test-token");
    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/items"] });

    const searchBox = await screen.findByRole("searchbox");
    await user.type(searchBox, "zz-no-such-thing");

    expect(await screen.findByText("No items match these filters")).toBeInTheDocument();
    // The other empty state must not appear instead — two different messages
    // for two different situations (§11 copy bank).
    expect(screen.queryByText("No items registered yet")).not.toBeInTheDocument();
  });

  it("sends a signed-out browse screen back to the form after sign-out", async () => {
    // The found bug: signing out while on `/items` left the browse screen
    // mounted and it immediately asked the API for a register with no token.
    setToken("test-token");
    const user = userEvent.setup();
    const { router } = renderWithProviders({ initialEntries: ["/items"] });

    expect(await screen.findByRole("searchbox")).toBeInTheDocument();

    // The sidebar's one sign-out action, as a real user clicks it.
    await user.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Staff sign in")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toContain("next=%2Fitems");
  });
});

describe("scan flow", () => {
  it("degrades cleanly when no camera exists and sends a manual lookup through sign-in", async () => {
    clearToken();
    const user = userEvent.setup();
    const { router } = renderWithProviders({ initialEntries: ["/scan"] });

    // jsdom has no mediaDevices: the scanner must read as a permission/
    // environment problem, never a broken app — and manual entry must remain.
    expect(
      await screen.findByText(/Camera access needs a secure connection/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Tag ID"), "cncs-ab12cd34");
    await user.click(screen.getByRole("button", { name: "Go" }));

    // `parseScannedTagId` uppercases the manual entry. The tag page needs an
    // account, so the typed tag is carried into sign-in and returned to after.
    expect(await screen.findByText("Staff sign in")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toContain("next=%2Fitem%2FCNCS-AB12CD34");
  });
});
