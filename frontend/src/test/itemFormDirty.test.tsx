import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { PRIVILEGED_ITEM } from "./fixtures";

/**
 * The edit form's Save button is gated on `isDirty`, and the department picker is
 * the one control on that form which is *not* a registered input — it is a
 * controlled `setValue` call.
 *
 * `setValue` does not mark the form dirty unless asked, so choosing a department
 * left Save greyed out: the field showed the new value while the form still
 * believed nothing had changed, and the only way to save was to type into some
 * unrelated text box first. That is the kind of "the save button is broken" a user
 * reports as a bug in the button.
 */
describe("item edit form — dirty state", () => {
  it("enables Save when only the department dropdown changes", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}/edit`] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: `Edit ${PRIVILEGED_ITEM.name}` });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    // A dropdown, not a text input — nothing is typed anywhere.
    await user.selectOptions(screen.getByLabelText("Department"), "Biology");

    expect(save).toBeEnabled();
  });
});
