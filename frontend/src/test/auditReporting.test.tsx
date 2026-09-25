import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPLETED_AUDIT_ID } from "./msw/handlers";
import { server } from "./msw/server";
import {
  ADMIN_USER,
  AUDIT_COMPLETION_BODY,
  AUDIT_READBACK,
  AUDIT_SCAN_ROW,
  AUDIT_SESSION,
  CSV_BODY,
  ITEMS_LIST,
  PRIVILEGED_ITEM,
  REQUEST_FIXTURE,
} from "./fixtures";
import { renderWithProviders } from "./utils";
import { saveWalkthrough } from "../lib/auditWalkthrough";
import { setToken } from "../lib/storage";
import type { Item } from "../types/item";
import type { AuditWalkthroughState } from "../types/audit";

const API = "http://localhost:4000/api/v1";

/**
 * Phase 3's tests (`Frontend_Three_Phase_Plan.md` §4 "Testing requirements").
 *
 * The rules under test are the ones the plan names: an audit runs
 * start → scan → complete and renders the *API's* counts; a client cannot
 * supply its own scan result; completing twice is refused with the server's
 * 409; and every CSV export carries the auth header and `format=csv` — the bug
 * a plain `<a href>` hides, because a bare link sends no Bearer token and
 * happily saves a 401 body as a `.csv`.
 */

/** A second item, so the accessory picker has a candidate to offer. */
const ACCESSORY_ITEM: Item = {
  ...PRIVILEGED_ITEM,
  id: "item-2",
  tagId: "CNCS-ACCE0001",
  name: "Laptop bag",
};

/**
 * `downloadBlob` builds an `<a download>` and clicks it. jsdom implements
 * neither `URL.createObjectURL` nor a real download, so both are stubbed and the
 * anchor's `download` attribute is captured — that attribute *is* the filename
 * the user sees in their downloads bar, which is what these tests assert.
 */
function captureDownloads(): { filenames: string[] } {
  const filenames: string[] = [];

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:mock"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });

  vi.spyOn(HTMLElement.prototype, "click").mockImplementation(function (this: HTMLElement) {
    if (this instanceof HTMLAnchorElement) filenames.push(this.download);
  });

  return { filenames };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * StatCard renders a label span beside a `tabular-nums` value span; this reads
 * that value. Matching is scoped to the card itself — a report page also states
 * "Found" in prose, so a bare text query is ambiguous by design, not by accident.
 */
function statValue(label: string): string | null | undefined {
  const card = screen
    .getAllByText(label)
    .map((el) => el.closest("div.flex.flex-col"))
    .find((el): el is Element => el !== null && el.querySelector("span.tabular-nums") !== null);
  return card?.querySelector("span.tabular-nums")?.textContent;
}

/** The scan endpoint answers with a *client-supplied* body only if the page sent one. */
async function startAuditAndScan() {
  const scanBodies: unknown[] = [];

  server.use(
    http.post(`${API}/audits`, () => HttpResponse.json(AUDIT_SESSION, { status: 201 })),
    http.post(`${API}/audits/audit-1/scan`, async ({ request }) => {
      scanBodies.push(await request.json());
      return HttpResponse.json(AUDIT_SCAN_ROW, { status: 201 });
    }),
  );

  setToken("test-token");
  const { router } = renderWithProviders({ initialEntries: ["/audit/new"] });
  const user = userEvent.setup();

  const department = await screen.findByLabelText("Department to audit");
  // Departments are derived from `GET /items` (there is no departments endpoint, G9).
  await waitFor(() => expect(within(department).getAllByRole("option").length).toBeGreaterThan(1));
  await user.selectOptions(department, "Computer Science");
  await user.click(screen.getByRole("button", { name: "Start audit" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/audit/audit-1/scan"));

  const tagInput = await screen.findByLabelText("Tag ID");
  await user.type(tagInput, "CNCS-AB12CD34");
  await user.click(screen.getByRole("button", { name: "Scan" }));

  return { user, router, scanBodies };
}

describe("audit walkthrough (F9)", () => {
  it("runs start → scan → complete and renders the API's counts, not its own", async () => {
    const { user, router, scanBodies } = await startAuditAndScan();

    // The scan landed in the session's running list, named after the scanned item.
    expect(await screen.findByText("Dell Latitude 5440")).toBeInTheDocument();

    // The client may send only the item id. `result` is computed at completion
    // server-side, so a page that tried to declare its own outcome would fail here.
    await waitFor(() => expect(scanBodies).toHaveLength(1));
    expect(scanBodies[0]).toEqual({ itemId: PRIVILEGED_ITEM.id });

    await user.click(screen.getByRole("button", { name: "Complete audit" }));

    // Completing is irreversible, so it goes through a ConfirmDialog stating the
    // consequence rather than firing on the first click.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/recorded as/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Complete audit" }));

    expect(await screen.findByRole("heading", { name: "Audit complete" })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/audit/audit-1/report"));

    // The fixture's counts are 3/2/1 precisely so each card is distinguishable.
    expect(statValue("Found")).toBe("3");
    expect(statValue("Missing")).toBe("2");
    expect(statValue("Outside scope")).toBe("1");
  });

  it("refuses an already-completed session with the server's 409 message", async () => {
    const walkthrough: AuditWalkthroughState = {
      scopeValue: "Computer Science",
      scanned: [
        {
          itemId: PRIVILEGED_ITEM.id,
          tagId: PRIVILEGED_ITEM.tagId,
          name: PRIVILEGED_ITEM.name,
          room: PRIVILEGED_ITEM.room,
          scannedAt: "2026-09-22T08:05:00.000Z",
        },
      ],
    };
    saveWalkthrough(COMPLETED_AUDIT_ID, walkthrough);

    /*
      The read-back is overridden to report the session as *open*, which is the
      race this test is about: the page loaded while the audit looked live (or the
      tab was open the whole time and someone else completed it). When the server
      says `completed: true` the walkthrough now disables the button instead — that
      case is covered in `auditHistory.test.tsx`.
    */
    server.use(
      http.get(`${API}/audits/:id`, () => HttpResponse.json(AUDIT_READBACK(COMPLETED_AUDIT_ID))),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: [`/audit/${COMPLETED_AUDIT_ID}/scan`] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Complete audit" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Complete audit" }));

    // A failed completion must be visible, not silently swallowed — the dialog
    // stays put and the API's own string is shown (inline, and once as a toast).
    expect((await screen.findAllByText("Audit session is already completed")).length).toBeGreaterThan(0);
  });

  it("reports a tag that matches no item as a failed scan, never a silent success", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/audit/audit-1/scan"] });
    const user = userEvent.setup();

    const tagInput = await screen.findByLabelText("Tag ID");
    await user.type(tagInput, "CNCS-NOPE0000");
    await user.click(screen.getByRole("button", { name: "Scan" }));

    expect(await screen.findByText(/no item matches tag CNCS-NOPE0000/i)).toBeInTheDocument();
    // Nothing was added to the running list.
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("report exports (F10)", () => {
  it("downloads all three CSVs with the auth header attached and format=csv", async () => {
    const requests: Request[] = [];
    const record = ({ request }: { request: Request }) => {
      requests.push(request);
      return new HttpResponse(CSV_BODY, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="report.csv"',
        },
      });
    };

    server.use(
      http.get(`${API}/reports/inventory`, record),
      http.get(`${API}/reports/disposals`, record),
      http.get(`${API}/reports/audit/:auditId`, record),
    );

    const { filenames } = captureDownloads();

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/reports"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Reports" });

    // Each export is a named region, which is what makes the two "Department"
    // selects addressable (and what a screen-reader user gets instead of two
    // identically-labelled controls).
    const inventoryRegion = screen.getByRole("region", { name: "Inventory" });
    const disposalsRegion = screen.getByRole("region", { name: "Disposals" });
    const auditRegion = screen.getByRole("region", { name: "Audit session" });

    // Departments are derived from `GET /items`, so they arrive after the card paints.
    const inventoryDepartment = within(inventoryRegion).getByLabelText("Department");
    await waitFor(() =>
      expect(within(inventoryDepartment).getAllByRole("option").length).toBeGreaterThan(1),
    );

    // --- Inventory, with a full filter set -------------------------------
    await user.selectOptions(inventoryDepartment, "Computer Science");
    await user.selectOptions(within(inventoryRegion).getByLabelText("Category"), "cat-1");
    await user.selectOptions(within(inventoryRegion).getByLabelText("Status"), "ACTIVE");
    await user.type(within(inventoryRegion).getByLabelText("Registered from"), "2026-09-01");
    await user.type(within(inventoryRegion).getByLabelText("Registered to"), "2026-09-30");
    await user.click(within(inventoryRegion).getByRole("button", { name: "Download inventory CSV" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    const inventoryUrl = new URL(requests[0]!.url);
    expect(inventoryUrl.pathname).toBe("/api/v1/reports/inventory");
    expect(inventoryUrl.searchParams.get("format")).toBe("csv");
    expect(inventoryUrl.searchParams.get("department")).toBe("Computer Science");
    expect(inventoryUrl.searchParams.get("categoryId")).toBe("cat-1");
    expect(inventoryUrl.searchParams.get("status")).toBe("ACTIVE");
    expect(inventoryUrl.searchParams.get("dateFrom")).toBe("2026-09-01");
    expect(inventoryUrl.searchParams.get("dateTo")).toBe("2026-09-30");
    // The header a plain `<a href>` would have omitted.
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer test-token");

    // --- Disposals -------------------------------------------------------
    await user.click(within(disposalsRegion).getByRole("button", { name: "Download disposals CSV" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    const disposalsRequest = requests[1]!;
    const disposalsUrl = new URL(disposalsRequest.url);
    expect(disposalsUrl.pathname).toBe("/api/v1/reports/disposals");
    expect(disposalsUrl.searchParams.get("format")).toBe("csv");
    expect(disposalsRequest.headers.get("authorization")).toBe("Bearer test-token");

    // --- One audit session ----------------------------------------------
    await user.type(within(auditRegion).getByLabelText("Audit session ID"), "audit-1");
    await user.click(within(auditRegion).getByRole("button", { name: "Download audit CSV" }));
    await waitFor(() => expect(requests).toHaveLength(3));
    const auditRequest = requests[2]!;
    const auditUrl = new URL(auditRequest.url);
    expect(auditUrl.pathname).toBe("/api/v1/reports/audit/audit-1");
    expect(auditUrl.searchParams.get("format")).toBe("csv");
    expect(auditRequest.headers.get("authorization")).toBe("Bearer test-token");

    // Filenames mirror the server's own stamp format (`YYYY-MM-DD`).
    expect(filenames).toHaveLength(3);
    expect(filenames.some((name) => /^inventory-report-\d{4}-\d{2}-\d{2}\.csv$/.test(name))).toBe(true);
    expect(filenames.some((name) => /^disposals-report-\d{4}-\d{2}-\d{2}\.csv$/.test(name))).toBe(true);
    expect(filenames).toContain("audit-report-audit-1.csv");
  });

  it("catches a reversed date range before it reaches the API", async () => {
    let reportCalls = 0;
    server.use(
      http.get(`${API}/reports/inventory`, () => {
        reportCalls += 1;
        return new HttpResponse(CSV_BODY, { headers: { "Content-Type": "text/csv" } });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/reports"] });
    const user = userEvent.setup();

    const region = await screen.findByRole("region", { name: "Inventory" });
    await user.type(within(region).getByLabelText("Registered from"), "2026-09-30");
    await user.type(within(region).getByLabelText("Registered to"), "2026-09-01");
    await user.click(within(region).getByRole("button", { name: "Download inventory CSV" }));

    // The server would 400; the client says why and never sends the request.
    expect(
      (await screen.findAllByText(/start date must be on or before the end date/i)).length,
    ).toBeGreaterThan(0);
    expect(reportCalls).toBe(0);
  });
});

describe("/map (F5.2)", () => {
  it("groups the register by building and links into each item's public page", async () => {
    server.use(
      http.get(`${API}/items`, () =>
        HttpResponse.json(ITEMS_LIST([PRIVILEGED_ITEM, { ...ACCESSORY_ITEM, building: "Building 3" }])),
      ),
    );

    renderWithProviders({ initialEntries: ["/map"] });

    expect(await screen.findByRole("heading", { name: "Browse by building" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Building 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Building 3" })).toBeInTheDocument();

    // The link target is the QR contract's singular route — the map must not
    // invent a second URL for the same item.
    expect(screen.getByRole("link", { name: new RegExp(PRIVILEGED_ITEM.name) })).toHaveAttribute(
      "href",
      `/item/${PRIVILEGED_ITEM.tagId}`,
    );
    expect(screen.getByRole("link", { name: new RegExp(ACCESSORY_ITEM.name) })).toHaveAttribute(
      "href",
      `/item/${ACCESSORY_ITEM.tagId}`,
    );
  });
});

/**
 * The plan's cross-phase walkthrough (§4, "Full-walkthrough test"). It runs in
 * four focused cases rather than one 15-screen mega-test, deliberately: the plan
 * asks for the walkthrough's *coverage* — one request asserted at each step — and
 * a single test that long spends most of its life rendering under parallel load,
 * where a failure names nothing useful. Same steps, same assertions, and a
 * failure now names the step that broke.
 */
describe("full walkthrough", () => {
  /** Every step's request, asserted against the wire — the request is the contract, not the pixels. */
  it("registers an item with no `parentItemId` on the request", async () => {
    let createBody: unknown;
    server.use(
      http.get(`${API}/items`, () => HttpResponse.json(ITEMS_LIST([PRIVILEGED_ITEM, ACCESSORY_ITEM]))),
      http.post(`${API}/items`, async ({ request }) => {
        createBody = await request.json();
        return HttpResponse.json(PRIVILEGED_ITEM, { status: 201 });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/items/new"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Register an item" });
    await user.type(screen.getByLabelText("Name"), "Dell Latitude 5440");
    const category = await screen.findByLabelText("Category");
    await waitFor(() => expect(within(category).getAllByRole("option").length).toBeGreaterThan(1));
    await user.selectOptions(category, "cat-1");
    await user.selectOptions(screen.getByLabelText("Department"), "Computer Science");
    await user.type(screen.getByLabelText("Building"), "Building 1");
    await user.type(screen.getByLabelText("Floor"), "Floor 2");
    await user.type(screen.getByLabelText("Room"), "Room 204");
    await user.selectOptions(screen.getByLabelText("Owner (custodian)"), ADMIN_USER.id);
    await user.type(screen.getByLabelText("Purchase cost (ETB)"), "45000");
    await user.click(screen.getByRole("button", { name: "Register item" }));

    await waitFor(() => expect(createBody).toBeDefined());
    expect(createBody).toMatchObject({
      name: "Dell Latitude 5440",
      categoryId: "cat-1",
      department: "Computer Science",
      purchaseCost: 45000,
    });
    // `parentItemId` must never be sent — the API 400s on it and points at the
    // accessories endpoint, which is the only writer of that field.
    expect(createBody).not.toHaveProperty("parentItemId");

    // The registered item's own public page is where the flow continues, and the
    // staff detail is a disclosure there rather than a link away from the record.
    expect(await screen.findByRole("button", { name: /view staff detail & tag/i })).toBeInTheDocument();
  });

  it("bundles an accessory from the staff workbench, and its request link reaches the form", async () => {
    let accessoryBody: unknown;
    server.use(
      http.get(`${API}/items`, () => HttpResponse.json(ITEMS_LIST([PRIVILEGED_ITEM, ACCESSORY_ITEM]))),
      http.post(`${API}/items/item-1/accessories`, async ({ request }) => {
        accessoryBody = await request.json();
        return HttpResponse.json({
          item: { id: "item-1", tagId: PRIVILEGED_ITEM.tagId, name: PRIVILEGED_ITEM.name },
          linkedItemIds: [ACCESSORY_ITEM.id],
          editLogRowCount: 2,
        });
      }),
    );

    setToken("test-token");
    // The staff page now loads from its own `:id` param (`GET /items/:id`).
    renderWithProviders({ initialEntries: [`/items/${PRIVILEGED_ITEM.id}`] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Link accessory" }));
    const picker = await screen.findByRole("dialog");
    await user.click(await within(picker).findByRole("button", { name: new RegExp(ACCESSORY_ITEM.name) }));

    await waitFor(() => expect(accessoryBody).toEqual({ accessoryItemIds: [ACCESSORY_ITEM.id] }));

    // Regression: this link once pointed at `/items/:id/request`, a route that has
    // never existed, so it fell through to the 404 page. It must land on the file
    // form with the item already chosen.
    await user.click(screen.getByRole("link", { name: "File transfer / disposal" }));
    expect(await screen.findByRole("heading", { name: "File a request" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Item")).toHaveValue(PRIVILEGED_ITEM.id));
  });

  it("files a transfer, then an admin approves it exactly once", async () => {
    let requestBody: unknown;
    const decisions: string[] = [];

    server.use(
      http.get(`${API}/items`, () => HttpResponse.json(ITEMS_LIST([PRIVILEGED_ITEM, ACCESSORY_ITEM]))),
      http.post(`${API}/requests`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          request: REQUEST_FIXTURE,
          notifiedReviewerCount: 1,
          emailStatus: "skipped",
        });
      }),
      http.post(`${API}/requests/req-1/approve`, () => {
        decisions.push("approve");
        return HttpResponse.json({
          request: { ...REQUEST_FIXTURE, status: "APPROVED", decidedAt: "2026-09-22T09:00:00.000Z" },
          itemChanges: { building: "Building 3" },
          cascadedItemIds: [],
          editLogRowCount: 3,
          notification: { code: "REQUEST_APPROVED", message: "Approved." },
          emailStatus: "skipped",
        });
      }),
    );

    setToken("test-token");
    const { router } = renderWithProviders({
      initialEntries: [`/requests/new?item=${encodeURIComponent(PRIVILEGED_ITEM.tagId)}`],
    });
    const user = userEvent.setup();

    // --- File it (F6.1) ---------------------------------------------------
    await screen.findByRole("heading", { name: "File a request" });
    const itemSelect = await screen.findByLabelText("Item");
    await waitFor(() => expect(within(itemSelect).getAllByRole("option").length).toBeGreaterThan(1));
    await user.selectOptions(itemSelect, PRIVILEGED_ITEM.id);
    await user.type(screen.getByLabelText("Building"), "Building 3");
    await user.type(screen.getByLabelText(/^Reason/), "The lab is moving to a different room this semester.");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => expect(requestBody).toBeDefined());
    expect(requestBody).toMatchObject({
      type: "TRANSFER",
      itemId: PRIVILEGED_ITEM.id,
      newLocationBuilding: "Building 3",
    });

    // --- Approve it (F6.2) ------------------------------------------------
    await waitFor(() => expect(router.state.location.pathname).toBe("/requests"));
    await user.click(await screen.findByRole("link", { name: /Dell Latitude 5440/ }));
    await screen.findByRole("heading", { name: /transfer request/i });
    await user.click(screen.getByRole("button", { name: "Approve" }));

    const confirm = screen.getByRole("dialog");
    expect(within(confirm).getByText(/can't be undone/i)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Approve" }));

    // Approval happens exactly once, and only through the ConfirmDialog.
    await waitFor(() => expect(decisions).toEqual(["approve"]));
  });

  it("audit → scan → complete → every CSV export, end to end", async () => {
    const generated = captureDownloads();
    const exported: string[] = [];

    const { user, router } = await startAuditAndScan();

    server.use(
      http.post(`${API}/audits/:id/complete`, ({ params }) =>
        HttpResponse.json(AUDIT_COMPLETION_BODY(params.id as string)),
      ),
      http.get(`${API}/reports/inventory`, ({ request }) => {
        exported.push(new URL(request.url).pathname + new URL(request.url).search);
        return new HttpResponse(CSV_BODY, { headers: { "Content-Type": "text/csv" } });
      }),
      http.get(`${API}/reports/disposals`, ({ request }) => {
        exported.push(new URL(request.url).pathname + new URL(request.url).search);
        return new HttpResponse(CSV_BODY, { headers: { "Content-Type": "text/csv" } });
      }),
      http.get(`${API}/reports/audit/:auditId`, ({ request }) => {
        exported.push(new URL(request.url).pathname + new URL(request.url).search);
        return new HttpResponse(CSV_BODY, { headers: { "Content-Type": "text/csv" } });
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Complete audit" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Complete audit" }));

    expect(await screen.findByRole("heading", { name: "Audit complete" })).toBeInTheDocument();
    expect(statValue("Found")).toBe("3");

    // The report page offers the session's own export directly (F10.3).
    await user.click(screen.getByRole("button", { name: "Download audit CSV" }));
    await waitFor(() => expect(generated.filenames).toContain("audit-report-audit-1.csv"));

    // ...and the reports page offers all three with a session's credentials.
    await router.navigate("/reports");
    await screen.findByRole("heading", { name: "Reports" });

    await user.click(screen.getByRole("button", { name: "Download inventory CSV" }));
    await user.click(screen.getByRole("button", { name: "Download disposals CSV" }));
    await user.type(screen.getByLabelText("Audit session ID"), "audit-1");
    await user.click(screen.getByRole("button", { name: "Download audit CSV" }));

    // Four calls in total: the report page's post-completion export, then the
    // three from `/reports`. Each must be a distinct endpoint and carry
    // `format=csv`, since anything else is a 400 on the real server.
    await waitFor(() => expect(exported.length).toBeGreaterThanOrEqual(4));
    for (const entry of exported) {
      expect(entry).toContain("format=csv");
    }
    expect(new Set(exported.map((entry) => entry.split("?")[0]))).toEqual(
      new Set([
        "/api/v1/reports/audit/audit-1",
        "/api/v1/reports/inventory",
        "/api/v1/reports/disposals",
      ]),
    );
  });
});
