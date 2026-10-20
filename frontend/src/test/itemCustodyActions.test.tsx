import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { OFFICER_USER, PRIVILEGED_ITEM, STAFF_USER } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * The item page's custody actions.
 *
 * Every endpoint these screens call existed on the server with **no screen to
 * reach it**: a claim could only be made by calling the API by hand, a handover
 * could not be verified, and a disposal could not be reversed. These tests
 * pin the three that matter — claim, refuse, verify, reverse — because they
 * are the actions a person is expected to take on an item that is waiting for
 * them.
 */
/**
 * The privileged item fixture, moved into the state the test needs.
 *
 * The holder must be the signed-in user for the claim controls to appear —
 * they are the actions only the person the item is registered to can take.
 */
function itemWith(overrides: Record<string, unknown>) {
  return {
    ...PRIVILEGED_ITEM,
    status: "PENDING_CLAIM",
    holderType: "USER",
    holderId: STAFF_USER.id,
    ...overrides,
  };
}

describe("the item page — custody actions", () => {
  beforeEach(() => {
    setToken("test-token");
  });

  it("offers the holder a claim, a correction and a refusal on a PENDING_CLAIM item", async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
      http.get(`${API}/items/${PRIVILEGED_ITEM.id}`, () => HttpResponse.json(itemWith({}))),
    );
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}`] });

    expect(await screen.findByRole("button", { name: /I have this item/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /condition is wrong/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /never received it/i })).toBeInTheDocument();
  });

  it("claims the item when the holder confirms it", async () => {
    let claimed = false;
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
      http.get(`${API}/items/${PRIVILEGED_ITEM.id}`, () => HttpResponse.json(itemWith({}))),
      http.post(`${API}/items/${PRIVILEGED_ITEM.id}/claim`, () => {
        claimed = true;
        return HttpResponse.json(itemWith({ status: "ACTIVE" }));
      }),
    );
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}`] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /I have this item/i }));

    await waitFor(() => expect(claimed).toBe(true));
  });

  it("refuses the item with a reason, and will not send an empty one", async () => {
    let reason: string | null = null;
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: STAFF_USER })),
      http.get(`${API}/items/${PRIVILEGED_ITEM.id}`, () => HttpResponse.json(itemWith({}))),
      http.post(`${API}/items/${PRIVILEGED_ITEM.id}/refuse-claim`, async ({ request }) => {
        reason = ((await request.json()) as { reason: string }).reason;
        return HttpResponse.json(itemWith({ status: "ACTIVE" }));
      }),
    );
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}`] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /never received it/i }));

    const dialog = await screen.findByRole("dialog");
    const refuse = within(dialog).getByRole("button", { name: /refuse the item/i });
    // No reason yet — the button says so rather than sending a blank one.
    expect(refuse).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/what happened/i), "The handover never happened.");
    await user.click(within(dialog).getByRole("button", { name: /refuse the item/i }));

    await waitFor(() => expect(reason).toBe("The handover never happened."));
  });

  it("offers a department head the verification an unverified item is waiting for", async () => {
    let verified = false;
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER })),
      http.get(`${API}/items/${PRIVILEGED_ITEM.id}`, () =>
        HttpResponse.json(itemWith({ status: "REVERTED_UNVERIFIED" })),
      ),
      http.post(`${API}/items/${PRIVILEGED_ITEM.id}/verify-confirm`, () => {
        verified = true;
        return HttpResponse.json(itemWith({ status: "ACTIVE" }));
      }),
    );
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}`] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /verified this item/i }));

    await waitFor(() => expect(verified).toBe(true));
  });

  it("lets a property officer reverse a disposal, with a reason", async () => {
    let reason: string | null = null;
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: OFFICER_USER })),
      http.get(`${API}/items/${PRIVILEGED_ITEM.id}`, () =>
        HttpResponse.json(itemWith({ status: "DISPOSED" })),
      ),
      http.post(`${API}/items/${PRIVILEGED_ITEM.id}/reverse-disposal`, async ({ request }) => {
        reason = ((await request.json()) as { reason: string }).reason;
        return HttpResponse.json({ message: "reversed" });
      }),
    );
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}`] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /reverse this disposal/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText(/why is the disposal being reversed/i),
      "Disposed in error — the item is in service.",
    );
    await user.click(within(dialog).getByRole("button", { name: /reverse the disposal/i }));

    await waitFor(() => expect(reason).toBe("Disposed in error — the item is in service."));
  });
});
