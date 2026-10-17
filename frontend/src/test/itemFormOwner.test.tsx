import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ACCOUNTS, OFFICER_USER, PRIVILEGED_ITEM, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * The custodian field on `/items/new`.
 *
 * Two things are being protected here, and they pull in the same direction:
 *
 *   1. the signed-in account is the *default*, so a form left untouched still
 *      submits a custodian (regression: the control is a controlled select, so an
 *      unseeded default showed an option while react-hook-form held `undefined`);
 *   2. the dropdown is followed when the user actually picks someone — it used to
 *      be overridden by the signed-in user's id in the payload, which made the
 *      select decorative. That mattered quietly, because registering is the only
 *      moment an item's custodian can be set without a transfer request.
 *
 * Both cases are run by the one role that reaches `/items/new` at all: the
 * Property Officer (spec 4.3), which also holds `USER_READ`, so the menu it sees
 * is every account rather than just itself.
 */
async function fillRequiredFields() {
  const user = userEvent.setup();

  await screen.findByRole("heading", { name: "Register an item" });
  await user.type(screen.getByLabelText("Name"), "Laptop");

  const category = await screen.findByLabelText("Category");
  await waitFor(() => expect(within(category).getAllByRole("option").length).toBeGreaterThan(1));
  await user.selectOptions(category, "cat-1");

  // Department is a dropdown now (lib/departments.ts), not a free-text input.
  await user.selectOptions(screen.getByLabelText("Department"), "Computer Science");
  const buildingEl = screen.getByLabelText("Building");
  if (buildingEl.tagName === "SELECT") {
    await user.selectOptions(buildingEl, "CNCS Building");
  } else {
    await user.type(buildingEl, "Freshmen Bldg");
  }
  await user.type(screen.getByLabelText("Floor"), "2nd");
  await user.type(screen.getByLabelText("Room"), "213");
  await user.type(screen.getByLabelText("Purchase cost (ETB)"), "28000");

  return user;
}

function captureCreateBody() {
  let body: Record<string, unknown> | null = null;
  server.use(
    http.post(`${API}/items`, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(PRIVILEGED_ITEM, { status: 201 });
    }),
  );
  return () => body;
}

describe("item form custodian", () => {
  it("submits the signed-in user without the owner field being touched", async () => {
    const created = captureCreateBody();

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/items/new"] });
    const user = await fillRequiredFields();

    // Note what is deliberately absent: no `selectOptions` on "Owner (custodian)".
    await user.click(screen.getByRole("button", { name: "Register item" }));

    await waitFor(() => expect(created()).not.toBeNull());
    expect(created()).toMatchObject({ ownerId: OFFICER_USER.id, name: "Laptop", categoryId: "cat-1" });
  });

  it("registers the item for another custodian when the registrar picks one", async () => {
    const created = captureCreateBody();

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/items/new"] });
    const user = await fillRequiredFields();

    // The registrar holds `USER_READ`, so the menu is every account — registering
    // on behalf of the person holding the asset is the real workflow, and this is
    // the only place an owner is set at all.
    const owner = screen.getByLabelText("Owner (custodian)");
    await waitFor(() => expect(within(owner).getAllByRole("option").length).toBe(ACCOUNTS.length));
    await user.selectOptions(owner, STAFF_USER.id);

    await user.click(screen.getByRole("button", { name: "Register item" }));

    await waitFor(() => expect(created()).not.toBeNull());
    expect(created()).toMatchObject({ ownerId: STAFF_USER.id });
    // The label keeps the "(you)" marker for the signed-in account only.
    expect(within(owner).getByRole("option", { name: `${OFFICER_USER.fullName} (you)` })).toBeInTheDocument();
  });

  /*
    There used to be a third case here: a registrar without `USER_READ` offered
    only their own account, with `GET /users` never sent. Under the five roles
    (spec 2.1.1) it cannot be reached through the UI — `/items/new` is the
    Property Officer's alone (spec 4.3), the officer has `USER_READ`, and the edit
    form shows the custodian read-only because a change of custodian is a TRANSFER.
    The self-only branch in `OwnerSelect` stays as a guard for the day the matrix
    widens; no route exercises it, so no route test claims it.
  */
});
