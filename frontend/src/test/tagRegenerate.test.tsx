import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { PRIVILEGED_ITEM } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * F3.5's "Regenerate tag" — the button that used to lie.
 *
 * Regeneration re-renders the QR PNG for the **same** Tag ID. Because the QR
 * payload is `${PUBLIC_BASE_URL}/item/${tagId}` and both halves are unchanged by
 * regenerating, the output is byte-identical — verified directly against
 * `qrGenerator`. So the only honest copy is "re-rendered and re-cached; the Tag
 * ID and its link do not change", and the only visible effect is that the panel
 * re-fetches. These tests pin both: the warning that a sticker "stops working"
 * must be gone, and the image must actually be re-requested after confirming.
 *
 * The dialog itself is not the subject here — `ConfirmDialog` has no accessible
 * name of its own beyond the title, which is what the assertions anchor on.
 */
describe("Regenerate tag", () => {
  /** Every toast currently on screen, so the user-visible answer can be asserted. */
  function toastText(): string {
    return Array.from(document.querySelectorAll("[data-sonner-toast]"))
      .map((node) => node.textContent ?? "")
      .join(" ");
  }

  async function openTagWorkbench(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("Navigation");
    const main = await screen.findByRole("main");
    await user.click(await within(main).findByRole("button", { name: /view staff detail & tag/i }));
    await within(main).findByText("Printable tag");
    return main;
  }

  it("describes the re-render honestly instead of warning that stickers stop working", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });
    const user = userEvent.setup();

    const main = await openTagWorkbench(user);
    await user.click(within(main).getByRole("button", { name: /regenerate tag/i }));

    const dialog = await screen.findByRole("dialog", { name: /re-render this tag/i });
    expect(within(dialog).getByText(/do not change/i)).toBeInTheDocument();
    // The old copy claimed the physical sticker is invalidated. It never was:
    // the encoded URL is unchanged, so existing stickers keep working.
    expect(within(dialog).queryByText(/stops working/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/replaces the printed sticker/i)).not.toBeInTheDocument();
  });

  it("re-fetches the tag image and reports the outcome after confirming", async () => {
    let tagFetches = 0;
    let regeneratePosts = 0;

    server.use(
      http.get(`${API}/items/:id/tag`, () => {
        tagFetches += 1;
        return new HttpResponse("<fake-png-bytes>", { headers: { "Content-Type": "image/png" } });
      }),
      http.post(`${API}/items/:id/tag/regenerate`, () => {
        regeneratePosts += 1;
        return HttpResponse.json({
          tagId: PRIVILEGED_ITEM.tagId,
          url: `http://localhost:5173/item/${PRIVILEGED_ITEM.tagId}`,
          dataUrl: "data:image/png;base64,PGZha2UtcG5nLWJ5dGVzPg==",
        });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });
    const user = userEvent.setup();

    const main = await openTagWorkbench(user);
    // The panel fetched the tag once on mount.
    await waitFor(() => expect(tagFetches).toBe(1));

    await user.click(within(main).getByRole("button", { name: /regenerate tag/i }));
    await user.click(await screen.findByRole("button", { name: /re-render image/i }));

    await waitFor(() => expect(regeneratePosts).toBe(1));
    // The assertion the `refreshKey` exists for: `invalidateQueries(["item"])`
    // cannot reach this fetch, so the panel must be told explicitly.
    await waitFor(() => expect(tagFetches).toBe(2));
    await waitFor(() => expect(toastText()).toContain("unchanged"));

    // The dialog closes on settle, success or failure.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /re-render this tag/i })).not.toBeInTheDocument(),
    );
  });
});
