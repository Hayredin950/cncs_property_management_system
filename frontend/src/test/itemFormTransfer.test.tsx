import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ADMIN_USER, PRIVILEGED_ITEM, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * Where an item is, and whose it is, is decided by an approved TRANSFER request
 * (SRS F6) — not by whoever is holding the edit form.
 *
 * The hole this closes was not the edit itself: `PUT /items/:id` was gated to
 * Staff/Admin and logged every change. It was that the *approval flow* — the
 * thing the requirement describes — could be skipped entirely by editing the room
 * and saving. So the form states the rule and the server enforces it, and the
 * tests here cover the two halves the frontend owns: the fields are not editable,
 * and the request that leaves does not quietly reassign the item either.
 */
describe("item edit form — transfer-owned columns", () => {
  it("renders the location and custodian read-only, and points at the transfer flow", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}/edit`] });

    await screen.findByRole("heading", { name: `Edit ${PRIVILEGED_ITEM.name}` });

    for (const label of ["Building", "Floor", "Room", "Owner ID"]) {
      // `readOnly`, not `disabled`: the server compares the submitted body with the
      // stored row, so these values still have to arrive with the save.
      expect(screen.getByLabelText(label)).toHaveAttribute("readonly");
    }

    expect(screen.getByRole("link", { name: "File a transfer request" })).toHaveAttribute(
      "href",
      `/requests/new?item=${PRIVILEGED_ITEM.tagId}`,
    );
  });

  it("keeps the item's own custodian on save instead of the signed-in editor", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put(`${API}/items/${PRIVILEGED_ITEM.id}`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(PRIVILEGED_ITEM);
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}/edit`] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: `Edit ${PRIVILEGED_ITEM.name}` });
    // A legitimate edit — the kind the form still exists for.
    await user.selectOptions(screen.getByLabelText("Condition"), "FAIR");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(body).not.toBeNull());
    // Regression: the payload used to carry the *editor's* id here, so saving any
    // item reassigned it to whoever saved it. An admin editing a staff member's
    // laptop made themselves its custodian.
    expect(body).toMatchObject({
      ownerId: PRIVILEGED_ITEM.ownerId,
      condition: "FAIR",
    });
    expect(body).not.toMatchObject({ ownerId: ADMIN_USER.id });
    expect(PRIVILEGED_ITEM.ownerId).toBe(STAFF_USER.id);
    // The location rides along unchanged, which is what the server compares.
    expect(body).toMatchObject({
      building: PRIVILEGED_ITEM.building,
      floor: PRIVILEGED_ITEM.floor,
      room: PRIVILEGED_ITEM.room,
    });
  });
});
