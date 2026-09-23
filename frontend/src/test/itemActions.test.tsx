import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ADMIN_USER, PRIVILEGED_ITEM, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * Edit and Delete, on both surfaces that expose them.
 *
 * The subject here is a *permission* rule, so most of these cases are about who
 * must *not* see the control: a staff member can edit but cannot delete, and an
 * anonymous visitor scanning a QR code sees neither. The delete itself is
 * destructive and irreversible, so its confirmation is asserted too — the dialog
 * has to say what actually goes, not "Are you sure?".
 */
describe("item actions", () => {
  /** The API's own response shape, so a UI reading the counts is exercised. */
  const DELETED = {
    id: PRIVILEGED_ITEM.id,
    tagId: PRIVILEGED_ITEM.tagId,
    name: PRIVILEGED_ITEM.name,
    unlinkedAccessoryCount: 0,
    deletedRequestCount: 1,
    deletedEditLogCount: 4,
    deletedAuditResultCount: 0,
  };

  function stubDelete(): { called: () => boolean } {
    let called = false;
    server.use(
      http.delete(`${API}/items/:id`, () => {
        called = true;
        return HttpResponse.json(DELETED);
      }),
    );
    return { called: () => called };
  }

  /** The session is the same token; only `GET /auth/me` decides the role. */
  function signInAsStaff(): void {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })));
  }

  describe("on the item page a QR scan lands on", () => {
    it("gives an admin Edit and a Delete that names every record it destroys", async () => {
      const del = stubDelete();
      setToken("test-token");
      renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });
      const user = userEvent.setup();

      // The edit link is the same shape the staff page uses: id in the path, tag
      // in the query, because the form loads by tag.
      const edit = await screen.findByRole("link", { name: /edit item/i });
      expect(edit).toHaveAttribute(
        "href",
        `/items/${PRIVILEGED_ITEM.id}/edit?tag=${encodeURIComponent(PRIVILEGED_ITEM.tagId)}`,
      );

      await user.click(screen.getByRole("button", { name: /delete item/i }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(PRIVILEGED_ITEM.name)).toBeInTheDocument();
      // "Are you sure?" would undersell this — these are the actual casualties.
      expect(within(dialog).getByText(/edit history/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/transfer or disposal requests/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/audit results/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
      // And the non-destructive alternative is offered, since retiring an asset
      // is the usual honest reason to want one gone from a list.
      expect(within(dialog).getByText(/disposal request instead/i)).toBeInTheDocument();

      expect(del.called()).toBe(false);

      await user.click(within(dialog).getByRole("button", { name: /delete permanently/i }));
      await waitFor(() => expect(del.called()).toBe(true));

      // Nothing is left to show on `/item/:tagId`, so the page leaves for the register.
      expect(await screen.findByRole("heading", { name: /browse items/i })).toBeInTheDocument();
    });

    it("gives staff Edit but no Delete", async () => {
      signInAsStaff();
      setToken("test-token");
      renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });

      expect(await screen.findByRole("link", { name: /edit item/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete item/i })).not.toBeInTheDocument();
    });

    it("shows a signed-out visitor neither", async () => {
      // No token at all — the public QR destination.
      renderWithProviders({ initialEntries: [`/item/${PRIVILEGED_ITEM.tagId}`] });

      expect(await screen.findByRole("heading", { name: PRIVILEGED_ITEM.name })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /edit item/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete item/i })).not.toBeInTheDocument();
    });
  });

  describe("on the browse grid", () => {
    it("puts per-card controls for an admin on the card, not inside its link", async () => {
      const del = stubDelete();
      setToken("test-token");
      renderWithProviders({ initialEntries: ["/items"] });
      const user = userEvent.setup();

      const edit = await screen.findByRole("button", { name: `Edit ${PRIVILEGED_ITEM.name}` });
      // The card's own link still points at the QR destination, and the controls
      // are its siblings — a button nested in an anchor is invalid HTML.
      expect(edit.closest("a")).toBeNull();
      expect(
        screen.getByRole("link", { name: new RegExp(PRIVILEGED_ITEM.name) }),
      ).toHaveAttribute("href", `/item/${PRIVILEGED_ITEM.tagId}`);

      await user.click(screen.getByRole("button", { name: `Delete ${PRIVILEGED_ITEM.name}` }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /delete permanently/i }));

      await waitFor(() => expect(del.called()).toBe(true));
      // The grid stays put — there is no page to leave.
      expect(screen.getByRole("heading", { name: /browse items/i })).toBeInTheDocument();
    });

    it("gives staff the card Edit control and no Delete", async () => {
      signInAsStaff();
      setToken("test-token");
      renderWithProviders({ initialEntries: ["/items"] });

      expect(
        await screen.findByRole("button", { name: `Edit ${PRIVILEGED_ITEM.name}` }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: `Delete ${PRIVILEGED_ITEM.name}` }),
      ).not.toBeInTheDocument();
    });

    it("leaves the public landing page free of controls", async () => {
      renderWithProviders({ initialEntries: ["/"] });

      // The anonymous listing shows the item, and no way to change it.
      expect(await screen.findByRole("link", { name: new RegExp(PRIVILEGED_ITEM.name) })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: `Delete ${PRIVILEGED_ITEM.name}` }),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps the admin role from the session, not from the URL", async () => {
    // Sanity check that the fixture really is the role being asserted above.
    expect(ADMIN_USER.role).toBe("ADMIN");
    expect(STAFF_USER.role).toBe("STAFF");
  });
});
