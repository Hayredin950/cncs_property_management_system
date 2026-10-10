import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { CATEGORY, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * `/admin/categories` (F2.4) — counts, the link into the filtered register, and
 * the two new operations.
 *
 * The delete case is the interesting one: a category in use must be impossible to
 * remove, because `Item.categoryId` is required and F7.2 forbids destroying the
 * items to make it possible.
 */
describe("/admin/categories", () => {
  it("shows each category's item count and links to the filtered register", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/categories"] });

    const link = await screen.findByRole("link", { name: CATEGORY.name });
    expect(link).toHaveAttribute("href", `/items?categoryId=${CATEGORY.id}`);
    expect(screen.getByText(`${CATEGORY.itemCount} items`)).toBeInTheDocument();
  });

  it("renames a category", async () => {
    let body: unknown = null;
    server.use(
      http.put(`${API}/categories/:id`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: CATEGORY.id, name: "Notebooks", itemCount: 2 });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/categories"] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: `Rename ${CATEGORY.name}` }));
    const input = await screen.findByLabelText("Category name");
    await user.clear(input);
    await user.type(input, "Notebooks");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body).toEqual({ name: "Notebooks" }));
  });

  /**
   * The `Esc` path through `Modal`, which had no coverage before the keydown
   * listener was reworked. `onClose` is an inline arrow above, so it is a new
   * function on every render — including on every keystroke. This asserts the two
   * things that rework had to preserve: `Esc` still closes, and the dialog is not
   * stranded by the re-renders typing causes.
   *
   * Note what this does *not* prove: it cannot distinguish "latest callback" from
   * "the callback captured when the dialog opened", because that arrow's behaviour
   * is identical every render. The focus-preservation guarantee is the other half,
   * and the rename case above (typing a full word) is what pins that.
   */
  it("closes on Escape after the dialog has re-rendered from typing", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/categories"] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: `Rename ${CATEGORY.name}` }));
    const input = await screen.findByLabelText("Category name");
    await user.clear(input);
    await user.type(input, "Notebooks");

    expect(screen.getByRole("dialog", { name: `Rename "${CATEGORY.name}"` })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("refuses to delete a category that still has items", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/categories"] });

    // Disabled, not hidden — and the reason is the accessible name, so it is not
    // a control that silently does nothing.
    const del = await screen.findByRole("button", {
      name: `Cannot delete ${CATEGORY.name} — ${CATEGORY.itemCount} items still use it`,
    });
    expect(del).toBeDisabled();
  });

  it("is not reachable by a staff account at all", async () => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })));
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/categories"] });

    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });
});
