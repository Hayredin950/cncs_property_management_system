import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { ADMIN_USER, PRIVILEGED_ITEM } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * The custodian field on `/items/new`, left untouched.
 *
 * Regression: the owner control is a *controlled* select, so react-hook-form held
 * `undefined` for `ownerId` until the user changed it. The select still showed an
 * option, so the only symptom was a bare zod message — "Invalid input: expected
 * string, received undefined" — under a field that looked filled in. Seeding the
 * default is the fix, and the assertion that matters is the request body, not the
 * select's face value.
 */
describe("item form custodian", () => {
  it("submits the signed-in user without the owner field being touched", async () => {
    let body: unknown = null;
    server.use(
      http.post(`${API}/items`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(PRIVILEGED_ITEM, { status: 201 });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/items/new"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Register an item" });
    await user.type(screen.getByLabelText("Name"), "Laptop");

    const category = await screen.findByLabelText("Category");
    await waitFor(() => expect(within(category).getAllByRole("option").length).toBeGreaterThan(1));
    await user.selectOptions(category, "cat-1");

    // Department is a dropdown now (lib/departments.ts), not a free-text input.
    await user.selectOptions(screen.getByLabelText("Department"), "Computer Science");
    await user.type(screen.getByLabelText("Building"), "Freshmen Bldg");
    await user.type(screen.getByLabelText("Floor"), "2nd");
    await user.type(screen.getByLabelText("Room"), "213");
    await user.type(screen.getByLabelText("Purchase cost (ETB)"), "28000");

    // Note what is deliberately absent: no `selectOptions` on "Owner (custodian)".
    await user.click(screen.getByRole("button", { name: "Register item" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ ownerId: ADMIN_USER.id, name: "Laptop", categoryId: "cat-1" });
  });
});
