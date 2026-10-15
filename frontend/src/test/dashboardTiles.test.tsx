import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { setToken } from "../lib/storage";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { AUDITOR_USER, DEPARTMENT_ROSTER, HEAD_USER, OVERDUE_LOANS, RECENT_ITEMS } from "./fixtures";
import type { MeResponse } from "../types/user";

const API = "http://localhost:4000/api/v1";

/**
 * The tile a heading belongs to: `<Card>`'s root element, which holds the header row
 * and the body. Scoping assertions to it matters here more than usual — these
 * fixtures' values ("Computer Science", a tag id) appear on several dashboard tiles
 * and in the nav, so a page-wide query would prove nothing about *this* tile.
 */
function tile(heading: string): HTMLElement {
  const header = screen.getByRole("heading", { name: heading }).closest("div");
  return header?.parentElement as HTMLElement;
}

/**
 * The four dashboard tiles that read a widget endpoint, and the one bug all four
 * shared.
 *
 * `useRecentItems`, `useHeldItems`, `useActiveAudit` and `useOpenFindings` each
 * called their endpoint with a bare, root-relative `fetch` — no `Authorization`
 * header, an origin that is only correct in `pnpm dev` — and folded *every* failure
 * into an empty result (`[]`, `{ count: 0 }`, `null`). Three of the four endpoints
 * were also unreachable on the server, because `GET /items/:tagId` and
 * `GET /audits/:id` were declared above them and matched the literal names first.
 *
 * So each tile had a wrong-but-plausible state that survived every test: the data
 * was never fetched, and what rendered instead looked like an empty register, an
 * empty audit history and an auditor with nothing in flight. These tests render the
 * real route tree with the real hooks and assert on the *values*, so a tile that
 * fabricates an empty state cannot pass them.
 *
 * The tiles are addressed through `/dashboard`, never in isolation: which tiles a
 * role gets is part of what is under test, and two of the four bugs were invisible
 * exactly because the widget was never mounted for the right role.
 */
describe("dashboard tiles", () => {
  it("shows the Property Officer's recent items with the endpoint's own timestamp field", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    await screen.findByRole("heading", { name: "Recently registered items" });
    const recent = within(tile("Recently registered items"));

    // The row renders the item from `GET /items/recent`, not from an empty array.
    const name = await recent.findByText(RECENT_ITEMS[0]?.name ?? "");
    expect(name).toBeInTheDocument();

    /*
      `registeredAt` is the field the handler selects and the only timestamp the
      fixture carries, so a tile still reading `createdAt` renders an empty span
      here — `formatRelativeTime` returns "" for an unparseable date, which is what
      makes "there is a time on this row" a real assertion rather than a cosmetic one.
    */
    const row = name.closest("li");
    expect(row?.textContent).toContain(RECENT_ITEMS[0]?.tagId ?? "");
    expect(row?.textContent).toMatch(/ago|Just now/);

    /*
      Positive control for the SYSTEM_ADMIN gate on these tiles (`systemDashboard`
      asserts the admin gets neither). An asset role must still get both — a fix
      that hid the tiles from everyone would pass the admin test and be wrong.
    */
    // Scoped to `main`: the officer's sidebar carries the same two labels, so a
    // page-wide query would match the nav rows and prove nothing about the tiles.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: /scan a tag/i })).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: /browse items/i })).toBeInTheDocument();
  });

  it("shows the Property Officer's overdue-loan count from GET /loans/overdue", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/dashboard"] });

    await screen.findByRole("heading", { name: "Overdue loans" });
    const loans = within(tile("Overdue loans"));

    /*
      The officer is the default session, so this is the same render as the recent-
      items test. The tile hides itself at a genuine zero and on a token-less 401 the
      old code vanished the same way — the count being present is what separates
      "two loans are overdue" from "we could not ask".
    */
    expect(await loans.findByText(String(OVERDUE_LOANS.count))).toBeInTheDocument();
    expect(loans.getByText("overdue loans")).toBeInTheDocument();
  });

  it("shows the Department Head's held-item count from GET /items/held-by-me", async () => {
    setToken("test-token");
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: HEAD_USER } as MeResponse)));
    renderWithProviders({ initialEntries: ["/dashboard"] });

    await screen.findByRole("heading", { name: "Your held items" });
    const held = within(tile("Your held items"));

    // `findBy` (not `getBy`): the heading renders with the tile, the count only
    // after the request lands.
    expect(await held.findByText("3")).toBeInTheDocument();
    expect(held.getByText("items held by you")).toBeInTheDocument();
    // Not the fabricated zero the old hook returned on every failure.
    expect(held.queryByText("0")).not.toBeInTheDocument();

    /*
      The roster tile asks `/departments/:id/roster` for the head's own unit
      (`HEAD_USER.departmentId`). The old hook called `/departments/roster`, which no
      route declares, so this count is what proves the id is being sent.
    */
    await screen.findByRole("heading", { name: "Department roster" });
    const roster = within(tile("Department roster"));
    expect(await roster.findByText(String(DEPARTMENT_ROSTER.staffCount))).toBeInTheDocument();
    expect(roster.getByText("staff members")).toBeInTheDocument();
    expect(roster.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows the Auditor's open session and findings count, mapped from the server's shape", async () => {
    setToken("test-token");
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: AUDITOR_USER } as MeResponse)));
    renderWithProviders({ initialEntries: ["/dashboard"] });

    /*
      `GET /audits/active` answers `{ active, session, progress }`; the tile renders
      four flat fields. Asserting on the mapped values is what proves the mapping:
      the old hook read `data.scope`/`data.scanned`/`data.total` off the raw body,
      where none of them exist.
    */
    await screen.findByRole("heading", { name: "Current audit" });
    const current = within(tile("Current audit"));
    expect(await current.findByText("Computer Science")).toBeInTheDocument();
    expect(current.getByText("2 / 5 scanned")).toBeInTheDocument();

    // `GET /audits/findings` is `{ count }`, and the fixture's is 4 — not the old
    // hardcoded zero.
    await screen.findByRole("heading", { name: "Open findings" });
    const findings = within(tile("Open findings"));
    expect(findings.getByText("4")).toBeInTheDocument();
    expect(findings.getByText(/missing items awaiting review/)).toBeInTheDocument();
  });

  it("renders a failure as a failure instead of as an empty state", async () => {
    setToken("test-token");
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: AUDITOR_USER } as MeResponse)),
      http.get(`${API}/audits/active`, () =>
        HttpResponse.json({ error: "Internal server error" }, { status: 500 }),
      ),
      http.get(`${API}/audits/findings`, () =>
        HttpResponse.json({ error: "Internal server error" }, { status: 500 }),
      ),
    );
    renderWithProviders({ initialEntries: ["/dashboard"] });

    expect(await screen.findByText("Couldn't load audit progress")).toBeInTheDocument();
    /*
      The findings tile hides itself when the count is genuinely zero — a permanent
      "0 findings" banner is noise. A 500 is not zero, so the tile has to render, and
      say which of the two things it does not know.
    */
    expect(await screen.findByText(/this is unknown, not zero/)).toBeInTheDocument();
  });
});
