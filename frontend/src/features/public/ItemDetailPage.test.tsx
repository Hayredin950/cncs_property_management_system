import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../test/utils";
import { setToken, clearToken } from "../../lib/storage";

/**
 * The Phase 1 test the plan calls the highest priority
 * (Frontend_Three_Phase_Plan.md §2): an anonymous render of `/item/:tagId`
 * contains none of the restricted fields, while a staff/admin render shows
 * them. The *server* strips the fields (`sanitizeItem`); these tests assert the
 * frontend renders exactly what each response contains — no client-side
 * re-hiding, and no privileged leakage either.
 *
 * Field list from frontend-plan.md §5 (SRS §3.4): cost, value, owner name,
 * brand, model, serial number, notes, accessories.
 */
const RESTRICTED_STRINGS = ["ETB", "Abebe Admin", "admin@cncs.aau.edu.et", "Dell", "Latitude 5440", "DL5440-0092", "Charger kept in the drawer"];

describe("/item/:tagId — field-visibility matrix", () => {
  it("renders no restricted field for an anonymous viewer", async () => {
    clearToken();
    renderWithProviders({ initialEntries: ["/item/CNCS-AB12CD34"] });

    const main = await screen.findByRole("main");
    await waitFor(() => {
      expect(within(main).getByText("Dell Latitude 5440")).toBeInTheDocument();
    });

    // Location is public (SRS §3.4) and must be visible to everyone.
    expect(within(main).getByText("Building 1")).toBeInTheDocument();

    for (const restricted of RESTRICTED_STRINGS) {
      expect(within(main).queryByText(restricted)).not.toBeInTheDocument();
    }
    // The Notes/Value/Owner sections are absent entirely, not rendered empty —
    // "render only what the response contains" (frontend-plan.md §5).
    expect(within(main).queryByText("Notes")).not.toBeInTheDocument();
    expect(within(main).queryByText("Purchase cost")).not.toBeInTheDocument();
    expect(within(main).queryByText("Custodian")).not.toBeInTheDocument();
  });

  it("renders the full record for a staff/admin viewer", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/item/CNCS-AB12CD34"] });

    // A stored token paints the public shell for the one frame before
    // `/auth/me` answers, then the workbench replaces it (`SmartLayout`). Wait
    // for the workbench first, so `main` below is the settled node rather than
    // one React has already unmounted.
    await screen.findByText("Navigation");
    const main = await screen.findByRole("main");
    expect(await within(main).findByText("ETB 45,000.00")).toBeInTheDocument();
    // The fixture item's owner is the staff user, not the signed-in admin —
    // the server returns whatever owner the row carries.
    expect(within(main).getByText("Sara Staff")).toBeInTheDocument();
    expect(within(main).getByText("DL5440-0092")).toBeInTheDocument();
    expect(within(main).getByText("Charger kept in the drawer.")).toBeInTheDocument();
  });
});

/**
 * The staff detail + tag used to be a link to `/items/:id`: a whole new route, a
 * second fetch for the same item, and `ScrollToTop` putting the reader back at the
 * top of a page they were already reading. It is a disclosure now, and it carries
 * the whole workbench at once — tag, print/regenerate, bundle, history. The thing
 * worth asserting is that opening it shows all of that and changes nothing else:
 * no second hop, and no navigation. The route is checked through the router rather
 * than `window.location`, since a memory router's navigations never touch the real
 * URL.
 */
describe("/item/:tagId — staff detail & tag disclosure", () => {
  it("opens the tag, the bundle and the history at once, without navigating", async () => {
    setToken("test-token");
    const { router } = renderWithProviders({ initialEntries: ["/item/CNCS-AB12CD34"] });
    const user = userEvent.setup();

    await screen.findByText("Navigation");
    const main = await screen.findByRole("main");

    const toggle = await within(main).findByRole("button", { name: /view staff detail & tag/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Nothing is fetched or shown until it is asked for.
    expect(within(main).queryByText("Edit history")).not.toBeInTheDocument();

    await user.click(toggle);

    // Opened: every part of the workbench, all at once. The tag with its own
    // print and regenerate actions, the accessory bundle, the edit history — and
    // the "you clicked it" signal a screen reader needs.
    expect(await within(main).findByText("Printable tag")).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /print sticker/i })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /regenerate tag/i })).toBeInTheDocument();
    expect(within(main).getByText(/accessories \(0\)/i)).toBeInTheDocument();
    expect(await within(main).findByText("Edit history")).toBeInTheDocument();
    expect(await within(main).findByText("Room 101")).toBeInTheDocument();
    expect(
      within(main).getByRole("button", { name: /hide staff detail & tag/i }),
    ).toHaveAttribute("aria-expanded", "true");

    // No second hop, and no navigation: the removed "Bundles, printing &
    // regeneration" link is gone, and the URL is still the QR destination.
    expect(within(main).queryByRole("link", { name: /bundles, printing/i })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/item/CNCS-AB12CD34");

    // The one link that stays is a form, not a second view of this item.
    expect(
      within(main).getByRole("link", { name: /file transfer \/ disposal/i }),
    ).toHaveAttribute("href", "/requests/new?item=CNCS-AB12CD34");
  });
});

describe("/item/:tagId — failure states", () => {
  it("renders 410 as the designed disposed state with F7.3's exact sentence", async () => {
    clearToken();
    renderWithProviders({ initialEntries: ["/item/CNCS-DEAD0000"] });

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("This item is no longer in service")).toBeInTheDocument();
    // It is not a generic error page: no retry button, calm tone.
    expect(within(main).queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("renders 404 for an unknown tag with the tag echoed back", async () => {
    clearToken();
    renderWithProviders({ initialEntries: ["/item/CNCS-NOPE0000"] });

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("Tag not found")).toBeInTheDocument();
    expect(within(main).getByText(/CNCS-NOPE0000/)).toBeInTheDocument();
  });
});
