import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { SYSTEM_ADMIN_USER, SYSTEM_EVENTS, SYSTEM_STATUS } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/**
 * The System Admin's dashboard tiles — `GET /system/status` and
 * `GET /system/events`.
 *
 * Both were wired to things that could not work, and the failures cancelled each
 * other out into a tile that looked fine. The hooks called `/admin/system/*`,
 * which nothing mounts (the router is at `/system` — `app.ts:116`), sent no
 * `Authorization` header, and turned every refusal into `"Unknown"` / `[]`: a
 * 404 and a 401 both rendered as a tidy card with nothing in it, which is the
 * silent-zero failure §13 was written about.
 *
 * And on the server side, `events` carried `auditSession` rows labelled
 * `type: "AUDIT"` — audit scopes and operators, to the one role that is supposed
 * to see no asset data at all (§10.4). These tests pin the shape the tile
 * consumes, the credential it has to send, and that what arrives is account
 * activity.
 */
describe("the System Admin's system tiles", () => {
  beforeEach(() => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: SYSTEM_ADMIN_USER })));
  });

  it("lists account events, with the bearer token the endpoint requires", async () => {
    let authorization: string | null = null;
    server.use(
      http.get(`${API}/system/events`, ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json(SYSTEM_EVENTS);
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("Recent system events")).toBeInTheDocument();

    // The row renders — which is the regression: the response used to be wrapped
    // in `{ data: [...] }` while the tile called `.map` on it, so any non-empty
    // answer threw instead of drawing.
    expect(await within(main).findByText("ACCOUNT_APPROVED")).toBeInTheDocument();
    expect(within(main).getByText("account approved — Sara Staff")).toBeInTheDocument();

    // And the request was authenticated. A tile with no credential is a tile that
    // renders empty forever.
    await waitFor(() => expect(authorization).toBe("Bearer test-token"));
  });

  it("shows an explicit empty state when no account action has been recorded", async () => {
    server.use(http.get(`${API}/system/events`, () => HttpResponse.json([])));

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("No recent system events")).toBeInTheDocument();
  });

  it("says the events could not be loaded rather than showing an empty list", async () => {
    server.use(
      http.get(`${API}/system/events`, () =>
        HttpResponse.json({ error: "Internal server error" }, { status: 500 }),
      ),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    const main = await screen.findByRole("main");
    // "Couldn't load" and "nothing has happened" must not look the same: the old
    // hook returned [] for this response too.
    expect(await within(main).findByText("Couldn't load system events")).toBeInTheDocument();
    expect(within(main).queryByText("No recent system events")).not.toBeInTheDocument();
  });

  /**
   * The rule this screen has broken three times now, in three different forms:
   * a SYSTEM_ADMIN is an account role and renders **no asset UI** (spec 2.1.1).
   *
   * This instance was the "Scan a tag" and "Browse items" quick-action tiles,
   * gated with `!isAuditor` — and an admin is not an auditor, so it got both. Each
   * leads to an asset screen the admin can only ever read as empty, i.e. it
   * advertises a capability the role does not have. The gate is now
   * `seesAssetData`, but this test asserts the *outcome* rather than the predicate,
   * so a fourth form of the same leak fails here rather than shipping.
   */
  it("renders no asset UI — no Scan/Browse tiles, and no links into the register", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    const main = await screen.findByRole("main");
    // Settle on the account tiles that *do* belong on this dashboard.
    expect(await within(main).findByText("System status")).toBeInTheDocument();

    expect(within(main).queryByText("Scan a tag")).not.toBeInTheDocument();
    expect(within(main).queryByText("Browse items")).not.toBeInTheDocument();

    // Stronger than the text check: nothing on the screen points at an asset
    // route at all. `/items/new` and friends would fail this too.
    const hrefs = within(main)
      .queryAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.filter((href) => href === "/scan" || href.startsWith("/items"))).toEqual([]);
  });

  it("shows the build facts from /system/status, not the placeholder for a missing route", async () => {
    let path = "";
    server.use(
      http.get(`${API}/system/status`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(SYSTEM_STATUS);
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("System status")).toBeInTheDocument();
    expect(await within(main).findByText("production")).toBeInTheDocument();
    expect(within(main).getByText("1h 12m")).toBeInTheDocument();

    // The path itself is under test: `/admin/system/status` is not mounted, and
    // the old "Unknown"-on-404 fallback hid exactly that mistake.
    expect(path).toBe("/api/v1/system/status");
  });
});
