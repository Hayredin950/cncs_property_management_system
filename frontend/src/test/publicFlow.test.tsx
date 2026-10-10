import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import { clearToken } from "../lib/storage";

/**
 * The plan's Phase 1 flow test (§2): search → result → item page, and manual
 * tag entry → item page — run anonymously, the way a visitor actually uses the
 * public flow.
 */
describe("browse flow", () => {
  it("searches via the URL, shows results, and links through to the item page", async () => {
    clearToken();
    const user = userEvent.setup();
    const { router } = renderWithProviders({ initialEntries: ["/items"] });

    const searchBox = await screen.findByRole("searchbox");
    await user.type(searchBox, "AB12CD34");

    // Filter state lives in the URL (shareable, back/forward-friendly) —
    // assert the router's location itself, not just the rendered list.
    await waitFor(() => {
      expect(router.state.location.search).toContain("search=AB12CD34");
    });

    const main = screen.getByRole("main");
    const cards = await within(main).findAllByText("Dell Latitude 5440");
    expect(cards.length).toBeGreaterThan(0);

    await user.click(cards[0]!);
    expect(await screen.findByText("Building 1")).toBeInTheDocument();
  });

  it("shows the filtered empty state, distinct from 'no items yet', when nothing matches", async () => {
    clearToken();
    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/items"] });

    const searchBox = await screen.findByRole("searchbox");
    await user.type(searchBox, "zz-no-such-thing");

    expect(await screen.findByText("No items match these filters")).toBeInTheDocument();
    // The other empty state must not appear instead — two different messages
    // for two different situations (§11 copy bank).
    expect(screen.queryByText("No items registered yet")).not.toBeInTheDocument();
  });
});

describe("scan flow", () => {
  it("degrades cleanly when no camera exists and manual entry resolves to the item page", async () => {
    clearToken();
    const user = userEvent.setup();
    renderWithProviders({ initialEntries: ["/scan"] });

    // jsdom has no mediaDevices: the scanner must read as a permission/
    // environment problem, never a broken app — and manual entry must remain.
    expect(
      await screen.findByText(/Camera access needs a secure connection/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Tag ID"), "cncs-ab12cd34");
    await user.click(screen.getByRole("button", { name: "Go" }));

    // parseScannedTagId uppercases the manual entry; the item page renders.
    expect(await screen.findByText("Dell Latitude 5440")).toBeInTheDocument();
  });
});
