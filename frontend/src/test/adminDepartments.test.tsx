import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { SYSTEM_ADMIN_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * `/admin/departments` — the administrator's two jobs, as two tabs.
 *
 * The screen used to open its add form in a modal over the list, so on a phone
 * the dialog covered the departments you were checking against and the list
 * underneath could not be scrolled. Buildings got the same treatment: a tab for
 * the existing rows, a tab for the form, and adding returns to the list.
 */

const DEPARTMENTS = [
  {
    id: "unit-cs",
    name: "Computer Science",
    code: "CS",
    type: "DEPARTMENT",
    isActive: true,
    acceptsSelfReg: true,
    college: "CNCS",
    head: { id: "user-head", fullName: "Hanna Tesfaye", email: "head.cs@cncs.aau.edu.et" },
    staffCount: 12,
  },
  {
    id: "unit-bio",
    name: "Biology",
    code: "BIO",
    type: "DEPARTMENT",
    isActive: true,
    acceptsSelfReg: false,
    college: "CNCS",
    head: null,
    staffCount: 6,
  },
];

describe("/admin/departments — existing list and add form are tabs", () => {
  beforeEach(() => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: SYSTEM_ADMIN_USER })),
      http.get(`${API}/departments/admin`, () => HttpResponse.json(DEPARTMENTS)),
      http.post(`${API}/departments`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ department: { name: body.name } });
      }),
    );
  });

  it("opens on the list, with the add form behind its own tab", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/departments"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await within(main).findByText("Computer Science");
    // The form's fields are not on the list screen.
    expect(within(main).queryByLabelText("Code")).not.toBeInTheDocument();

    await user.click(within(main).getByRole("button", { name: /Add a department/i }));
    expect(await within(main).findByLabelText("Code")).toBeInTheDocument();
    expect(within(main).queryByText("Computer Science")).not.toBeInTheDocument();

    await user.click(within(main).getByRole("button", { name: /Existing departments/i }));
    expect(await within(main).findByText("Computer Science")).toBeInTheDocument();
  });

  it("adding a department returns to the list, where the new row is", async () => {
    const posts = vi.fn();
    server.use(
      http.post(`${API}/departments`, async ({ request }) => {
        const body = (await request.json()) as { name: string; code: string };
        posts(body);
        return HttpResponse.json({ department: { name: body.name } });
      }),
    );
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/admin/departments"] });
    const user = userEvent.setup();

    const main = await screen.findByRole("main");
    await within(main).findByText("Computer Science");

    await user.click(within(main).getByRole("button", { name: /Add a department/i }));
    await user.type(await within(main).findByLabelText("Name"), "Environmental Engineering");
    await user.type(within(main).getByLabelText("Code"), "ENVE");
    await user.click(within(main).getByRole("button", { name: /Add the department/i }));

    // Back on the list, with the confirmation banner above it.
    await waitFor(() =>
      expect(within(main).getByText(/Environmental Engineering has been added/i)).toBeInTheDocument(),
    );
    expect(within(main).getByText("Computer Science")).toBeInTheDocument();
    expect(posts).toHaveBeenCalledWith({ name: "Environmental Engineering", code: "ENVE", acceptsSelfReg: true });
  });
});
