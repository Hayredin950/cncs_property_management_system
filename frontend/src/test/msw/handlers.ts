import { http, HttpResponse } from "msw";
import {
  AUDIT_COMPLETION_BODY,
  AUDIT_SCAN_ROW,
  AUDIT_SESSION,
  CSV_BODY,
  DISPOSED_ITEM,
  HISTORY_FIXTURE,
  ITEMS_LIST,
  LOGIN_RESPONSE,
  ME_RESPONSE,
  NOTIFICATIONS_LIST,
  PENDING_COUNT,
  PRIVILEGED_ITEM,
  PUBLIC_ITEM,
  REQUEST_DETAIL_FIXTURE,
  REQUEST_FIXTURE,
  REQUESTS_LIST,
} from "../fixtures";
import { getToken } from "../../lib/storage";

const API = "http://localhost:4000/api/v1";

/**
 * Default handlers built straight from docs/backend-handoff.md.
 *
 * MSW intercepts at the network layer, so these run inside the same jsdom
 * environment as the test — `getToken()` reads the exact `localStorage` key the
 * real `apiClient` writes, which is what makes an "authenticated" variant vs an
 * "anonymous" variant a real header difference the real client code produces.
 *
 * A missing token answers 401 here the way the backend's `authenticate`
 * middleware would — tests must never get privileged data by accident.
 */
const unauthorized = () => HttpResponse.json({ error: "Not authenticated" }, { status: 401 });

const tagPng = () =>
  new HttpResponse("<fake-png-bytes>", { headers: { "Content-Type": "image/png" } });

/** Every screen renders the health indicator, so this handler is load-bearing for the whole suite. */
const healthOk = () => HttpResponse.json({ status: "ok" });

const csv = () =>
  new HttpResponse(CSV_BODY, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="report.csv"',
    },
  });

/** The session id the complete/409 tests use — completing it again is refused by the API. */
export const COMPLETED_AUDIT_ID = "audit-done";

export const handlers = [
  http.post(`${API}/auth/login`, () => HttpResponse.json(LOGIN_RESPONSE)),

  http.get(`${API}/auth/me`, () => (getToken() ? HttpResponse.json(ME_RESPONSE) : unauthorized())),

  http.get(`${API}/health`, healthOk),

  http.get(`${API}/categories`, () => HttpResponse.json([{ id: "cat-1", name: "Laptops" }])),

  http.get(`${API}/items`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.toLowerCase() ?? "";
    // One physical item = one row in a list; the *viewer's* variant (staff sees
    // the privileged shape, anonymous the public one) is the same field
    // filtering the detail endpoint applies.
    let items = [getToken() ? PRIVILEGED_ITEM : PUBLIC_ITEM];
    if (search) {
      items = items.filter(
        (item) => item.name.toLowerCase().includes(search) || item.tagId.toLowerCase().includes(search),
      );
    }
    return HttpResponse.json(ITEMS_LIST(items));
  }),

  /**
   * The same physical item, filtered per the Authorization header — that
   * filtering is the *server's* job (`sanitizeItem`). The frontend tests exist
   * to prove each variant renders correctly and the client never re-hides
   * fields itself (frontend-plan.md §5).
   */
  http.get(`${API}/items/:tagId`, ({ params }) => {
    const tagId = params.tagId as string;
    if (tagId === "CNCS-DEAD0000") {
      if (getToken()) {
        return HttpResponse.json(DISPOSED_ITEM);
      }
      // F7.3's exact sentence, nothing else.
      return HttpResponse.json({ error: "This item is no longer in service" }, { status: 410 });
    }
    if (tagId !== "CNCS-AB12CD34") {
      return HttpResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return HttpResponse.json(getToken() ? PRIVILEGED_ITEM : PUBLIC_ITEM);
  }),

  http.get(`${API}/items/:id/tag`, () => (getToken() ? tagPng() : unauthorized())),

  http.get(`${API}/items/:id/history`, () =>
    getToken() ? HttpResponse.json(HISTORY_FIXTURE) : unauthorized(),
  ),

  http.get(`${API}/requests`, () => (getToken() ? HttpResponse.json(REQUESTS_LIST) : unauthorized())),

  http.get(`${API}/requests/pending-count`, () =>
    getToken() ? HttpResponse.json(PENDING_COUNT) : unauthorized(),
  ),

  // Declared *after* pending-count so that literal path wins the match; a
  // `:id` handler placed first would swallow `/requests/pending-count`.
  http.get(`${API}/requests/:id`, ({ params }) => {
    if (!getToken()) return unauthorized();
    return params.id === REQUEST_DETAIL_FIXTURE.id
      ? HttpResponse.json({ request: REQUEST_DETAIL_FIXTURE })
      : HttpResponse.json({ error: "Request not found" }, { status: 404 });
  }),

  http.post(`${API}/requests`, () => {
    if (!getToken()) return unauthorized();
    return HttpResponse.json({
      request: REQUEST_FIXTURE,
      notifiedReviewerCount: 1,
      emailStatus: "skipped",
    });
  }),

  http.get(`${API}/notifications`, () =>
    getToken() ? HttpResponse.json(NOTIFICATIONS_LIST) : unauthorized(),
  ),

  http.post(`${API}/notifications/:id/read`, () =>
    getToken() ? HttpResponse.json({ id: "n-1", isRead: true }) : unauthorized(),
  ),

  /**
   * Audit sessions (F9). The scan endpoint answers with the persisted row, whose
   * `result` is always FOUND — the same shape the real handler returns, so a page
   * that tried to submit its own result would fail these tests.
   */
  http.post(`${API}/audits`, () =>
    getToken() ? HttpResponse.json(AUDIT_SESSION, { status: 201 }) : unauthorized(),
  ),

  http.post(`${API}/audits/:id/scan`, () =>
    getToken() ? HttpResponse.json(AUDIT_SCAN_ROW, { status: 201 }) : unauthorized(),
  ),

  http.post(`${API}/audits/:id/complete`, ({ params }) => {
    if (!getToken()) return unauthorized();
    const id = params.id as string;
    if (id === COMPLETED_AUDIT_ID) {
      // Byte-for-byte the message the backend sends from its 409 branch.
      return HttpResponse.json({ error: "Audit session is already completed" }, { status: 409 });
    }
    return HttpResponse.json(AUDIT_COMPLETION_BODY(id));
  }),

  /**
   * Report exports (F10) — CSV only, behind `authenticate`. The `format=csv`
   * default matches the server's `z.enum(["csv"]).default("csv")`, so a client
   * that forgot the parameter would still get a file here but a 400 in real life;
   * the download tests assert the parameter explicitly for that reason.
   */
  http.get(`${API}/reports/inventory`, () => (getToken() ? csv() : unauthorized())),
  http.get(`${API}/reports/disposals`, () => (getToken() ? csv() : unauthorized())),
  http.get(`${API}/reports/audit/:auditId`, () => (getToken() ? csv() : unauthorized())),
];
