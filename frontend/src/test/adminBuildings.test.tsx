import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { OFFICER_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * `/admin/buildings` — the Property Officer's building list.
 *
 * The screen used to be one long page: the add form first, the list the officer
 * came for below it. On a laptop that is a scroll; on a phone it meant the row
 * you wanted started below a screenful of inputs. It is now two tabs — the
 * buildings, and the form that adds one — with a search over the list, which is
 * the same shape the Accounts screen uses.
 *
 * These tests pin the split and the search, because both are the kind of thing a
 * later refactor can quietly undo while every screen still "renders".
 */

const BUILDINGS = [
  { id: "bld-cncs", name: "CNCS Building", code: "CNCS", address: "North campus", description: null, itemCount: 77 },
  { id: "bld-phys", name: "Physics Building", code: "PHYS", address: null, description: null, itemCount: 0 },
];

describe("/admin/buildings — two tabs and a searchable list", () => {
  beforeEach(() => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER })),
      http.get(`${API}/buildings`, () => HttpResponse.json({ data: BUILDINGS })),
    );
  });

  it("opens on the list, with the add form behind its own tab", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/buildings"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await within(main).findByText("CNCS Building");
    // The form's fields are not on the list screen.
    expect(within(main).queryByLabelText("Address")).not.toBeInTheDocument();

    await user.click(within(main).getByRole("button", { name: /Add a building/i }));
    expect(await within(main).findByLabelText("Address")).toBeInTheDocument();
    expect(within(main).queryByText("CNCS Building")).not.toBeInTheDocument();

    await user.click(within(main).getByRole("button", { name: /^Buildings/i }));
    expect(await within(main).findByText("CNCS Building")).toBeInTheDocument();
  });

  it("searches name, code and address, and says when nothing matches", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/buildings"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await within(main).findByText("Physics Building");

    // "north" is only in CNCS's address, so the match is not just the name.
    const search = within(main).getByPlaceholderText("Search name, code or address");
    // The bar debounces, so the filtered list arrives a tick later.
    await user.type(search, "north");
    await waitFor(() => expect(within(main).queryByText("Physics Building")).not.toBeInTheDocument());
    expect(within(main).getByText("CNCS Building")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz");
    expect(await within(main).findByText(/No building matches/i)).toBeInTheDocument();
  });
});
