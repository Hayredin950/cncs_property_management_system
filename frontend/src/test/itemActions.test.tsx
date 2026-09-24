import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { PRIVILEGED_ITEM, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * The Edit affordance, on both surfaces that expose it.
 *
 * The subject here is a *permission* rule, so most of these cases are about who
 * must *not* see the control: an anonymous visitor scanning a QR code sees no
 * staff chrome at all.
 *
 * There is deliberately no delete case. Nothing in the app destroys an item —
 * retiring an asset is a disposal request that keeps the record (F7.2), so a
 * Delete control should not exist on any surface. The last case asserts that.
 */
describe("item actions", () => {
  /** The session is the same token; only `GET /auth/me` decides the role. */
  function signInAsStaff(): void {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })));
  }

  describe("on the item page a QR scan lands on", () => {
    it("gives a signed-in viewer a link to the edit form", async () => {
      signInAsStaff();
      setToken("test-token");
      renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });

      // The edit link is the same shape the staff page uses: id in the path, tag
      // in the query, because the form loads by tag.
      const edit = await screen.findByRole("link", { name: /edit item/i });
      expect(edit).toHaveAttribute(
        "href",
        `/items/${PRIVILEGED_ITEM.id}/edit?tag=${encodeURIComponent(PRIVILEGED_ITEM.tagId)}`,
      );
    });

    it("never offers a Delete, even signed in", async () => {
      signInAsStaff();
      setToken("test-token");
      renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });

      await screen.findByRole("link", { name: /edit item/i });
      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("shows no staff chrome to an anonymous visitor", async () => {
      renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });

      // The public detail renders, but no edit control comes with it.
      await screen.findByRole("heading", { name: PRIVILEGED_ITEM.name });
      expect(screen.queryByRole("link", { name: /edit item/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });
  });
});
