import { http, HttpResponse } from "msw";
import {
  ACCEPTED_INVITE_USER,
  ACCOUNTS,
  ACTIVE_AUDIT,
  AUDIT_COMPLETION_BODY,
  AUDIT_READBACK,
  AUDIT_SCAN_ROW,
  AUDIT_SESSION,
  AUDITS_LIST,
  CSV_BODY,
  DEPARTMENTS,
  DEPARTMENT_ROSTER,
  DISPOSED_ITEM,
  HISTORY_FIXTURE,
  HELD_ITEMS_SUMMARY,
  INVITABLE_UNITS,
  ITEMS_LIST,
  LOGIN_RESPONSE,
  ME_RESPONSE,
  NOTIFICATIONS_LIST,
  OPEN_FINDINGS_COUNT,
  OVERDUE_LOANS,
  PENDING_ACCOUNT,
  PENDING_COUNT,
  RECENT_ITEMS,
  PRIVILEGED_ITEM,
  PUBLIC_ITEM,
  REQUEST_DETAIL_FIXTURE,
  REQUEST_FIXTURE,
  REQUESTS_LIST,
  SYSTEM_EVENTS,
  SYSTEM_STATUS,
} from "../fixtures";
import { getToken } from "../../lib/storage";
import type { UserSummary } from "../../types/user";

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

/**
 * What `POST /uploads/photo` resolves with — a Cloudinary `secure_url`, which is
 * exactly the shape `Item.photoUrl` accepts (an absolute `https` value).
 */
export const UPLOADED_PHOTO_URL =
  "https://res.cloudinary.com/demo/image/upload/v1/cncs-pms/items/pending-test.jpg";

export const handlers = [
  http.post(`${API}/auth/login`, () => HttpResponse.json(LOGIN_RESPONSE)),

  http.get(`${API}/auth/me`, () => (getToken() ? HttpResponse.json(ME_RESPONSE) : unauthorized())),

  /**
   * `POST /auth/account-requests` — public. No token is returned: the account is
   * pending and cannot sign in until an administrator decides.
   */
  http.post(`${API}/auth/account-requests`, async ({ request }) => {
    const body = (await request.json()) as {
      fullName?: string;
      email?: string;
      password?: string;
    };
    return HttpResponse.json(
      {
        message: "Request submitted for approval",
        request: {
          id: PENDING_ACCOUNT.id,
          fullName: body.fullName ?? PENDING_ACCOUNT.fullName,
          email: body.email ?? PENDING_ACCOUNT.email,
          accountStatus: "PENDING_APPROVAL",
          requestedAt: PENDING_ACCOUNT.createdAt,
        },
      },
      { status: 201 },
    );
  }),

  http.get(`${API}/health`, healthOk),

  /**
   * Public, like the real route: an anonymous visitor picks their department
   * before they have an account. No token check here on purpose.
   */
  /**
   * `GET /departments/invitable` — the head-appointment picker (T6). Behind
   * `ACCOUNT_INVITE`, so a missing token is the same 401 every admin read sends.
   *
   * Declared before the `/departments` handler so the more specific path is the
   * one that reads first — the two are distinct patterns (MSW matches a literal
   * path exactly), but a reader looking for "where does /departments/invitable go"
   * should find its answer above the list it is not part of.
   */
  http.get(`${API}/departments/invitable`, () =>
    getToken() ? HttpResponse.json(INVITABLE_UNITS) : unauthorized(),
  ),

  http.get(`${API}/departments`, () => HttpResponse.json(DEPARTMENTS)),

  /**
   * `GET /departments/:id/roster` — the Department Head's roster tile. Behind
   * `authenticate`, and the id is the head's own unit, so the fixture echoes the id
   * it was asked for. Declared after the literal `/departments/invitable` for the
   * ordering discipline the router uses, though the patterns are distinct.
   */
  http.get(`${API}/departments/:id/roster`, ({ params }) =>
    getToken()
      ? HttpResponse.json({ ...DEPARTMENT_ROSTER, department: { ...DEPARTMENT_ROSTER.department, id: params.id as string } })
      : unauthorized(),
  ),

  /**
   * `POST /auth/accept-invite` — public, like the real route: the person does not
   * have an account to authenticate with, which is what the invitation is for. It
   * answers with a session, so the invitee does not have to sign in twice.
   */
  http.post(`${API}/auth/accept-invite`, () =>
    HttpResponse.json({ token: "invite-session-token", user: ACCEPTED_INVITE_USER }),
  ),

  http.get(`${API}/categories`, () => HttpResponse.json([{ id: "cat-1", name: "Laptops", itemCount: 2 }])),

  /**
   * `POST /users/invite` — the privileged invite (T6). There is no password in
   * the request or the response, and that is the contract under test: an
   * administrator learns the email result and gets the single-use link back, and
   * nothing here can be signed into until the invitee accepts it.
   */
  http.post(`${API}/users/invite`, async ({ request }) => {
    if (!getToken()) return unauthorized();
    const body = (await request.json()) as {
      email?: string;
      role?: string;
      unitId?: string | null;
    };
    return HttpResponse.json(
      {
        invite: {
          userId: "invitee-1",
          email: body.email ?? "",
          role: body.role ?? "DEPARTMENT_HEAD",
          unitId: body.unitId ?? null,
          status: "PENDING_EMAIL_VERIFICATION",
          expiresAt: "2026-10-17T08:00:00.000Z",
          renewed: false,
        },
        inviteUrl: "http://localhost:5173/accept-invite?token=test-invite-token",
        // The live default while no mail transport is configured.
        email: "skipped",
      },
      { status: 201 },
    );
  }),



  http.put(`${API}/categories/:id`, ({ params }) =>
    getToken()
      ? HttpResponse.json({ id: params.id, name: "Renamed", itemCount: 0 })
      : unauthorized(),
  ),

  http.delete(`${API}/categories/:id`, ({ params }) =>
    getToken() ? HttpResponse.json({ id: params.id, deleted: true }) : unauthorized(),
  ),

  /** The admin accounts screen (`GET /users` is Admin-only; a missing token 401s like every other write). */
  http.get(`${API}/users`, () => (getToken() ? HttpResponse.json(ACCOUNTS) : unauthorized())),

  /**
   * The approval queue. Declared before any `/users/:id` POST so the literal path
   * wins — same ordering discipline as `/requests/pending-count`.
   */
  http.get(`${API}/users/approvals`, () =>
    getToken() ? HttpResponse.json([PENDING_ACCOUNT]) : unauthorized(),
  ),

  http.patch(`${API}/users/:id`, async ({ params, request }) => {
    if (!getToken()) return unauthorized();
    const body = (await request.json()) as { fullName?: string; email?: string };
    return HttpResponse.json({ ...ACCOUNTS[0], id: params.id, ...body });
  }),

  /** The role change echoes the role it was asked for, the way the server does. */
  http.post(`${API}/users/:id/promote`, async ({ params, request }) => {
    if (!getToken()) return unauthorized();
    const { role } = (await request.json()) as { role: UserSummary["role"] };
    return HttpResponse.json({ ...ACCOUNTS[1], id: params.id, role });
  }),

  http.post(`${API}/users/:id/approve`, async ({ params, request }) => {
    if (!getToken()) return unauthorized();
    const body = (await request.json()) as { role?: UserSummary["role"] };
    return HttpResponse.json({
      ...PENDING_ACCOUNT,
      id: params.id,
      accountStatus: "ACTIVE",
      role: body.role ?? PENDING_ACCOUNT.role,
      reviewedAt: "2026-09-16T12:00:00.000Z",
      reviewNote: null,
    });
  }),

  http.post(`${API}/users/:id/reject`, async ({ params, request }) => {
    if (!getToken()) return unauthorized();
    const body = (await request.json()) as { reason?: string };
    return HttpResponse.json({
      ...PENDING_ACCOUNT,
      id: params.id,
      accountStatus: "REJECTED",
      reviewedAt: "2026-09-16T12:00:00.000Z",
      reviewNote: body.reason ?? null,
    });
  }),

  http.post(`${API}/users/:id/password`, ({ params }) =>
    getToken() ? HttpResponse.json({ id: params.id, passwordChanged: true }) : unauthorized(),
  ),

  http.delete(`${API}/users/:id`, ({ params }) =>
    getToken() ? HttpResponse.json({ id: params.id, deleted: true }) : unauthorized(),
  ),

  /** Item registration. The real server answers with the created row (201). */
  http.post(`${API}/items`, () =>
    getToken() ? HttpResponse.json(PRIVILEGED_ITEM, { status: 201 }) : unauthorized(),
  ),

  /**
   * The item form's photo upload. Writes are authenticated like every other
   * write, so an anonymous caller gets the same 401 the API would send.
   */
  http.post(`${API}/uploads/photo`, () =>
    getToken() ? HttpResponse.json({ url: UPLOADED_PHOTO_URL }, { status: 201 }) : unauthorized(),
  ),

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
   * The Property Officer's two tiles. Both are declared **before**
   * `${API}/items/:idOrTag` below, and that ordering is load-bearing in exactly the
   * way the router's was: a one-segment literal under a one-segment param pattern
   * is unreachable, which is how `/items/recent` came back as "no such item" and the
   * tile read it as an empty register (14 Oct). A handler declared after it would
   * make these tests pass for the wrong reason.
   */
  http.get(`${API}/items/recent`, () => (getToken() ? HttpResponse.json(RECENT_ITEMS) : unauthorized())),

  http.get(`${API}/items/held-by-me`, () =>
    getToken() ? HttpResponse.json(HELD_ITEMS_SUMMARY) : unauthorized(),
  ),

  /**
   * The same physical item, filtered per the Authorization header — that
   * filtering is the *server's* job (`sanitizeItem`). The frontend tests exist
   * to prove each variant renders correctly and the client never re-hides
   * fields itself (frontend-plan.md §5).
   */
  /*
   * One path serves both lookups, mirroring the backend: a uuid/id resolves the
   * row directly, anything else is a tag id. The staff and edit routes now use
   * the id form (`GET /items/:id`), so the handler has to accept it too.
   */
  http.get(`${API}/items/:idOrTag`, ({ params }) => {
    const key = params.idOrTag as string;
    // Only the tag identifies the disposed fixture: it is built on the same
    // `id` as the active item (its "physical" row), so matching on id would
    // hand back the disposed copy for every id-based lookup.
    if (key === "CNCS-DEAD0000") {
      if (getToken()) {
        return HttpResponse.json(DISPOSED_ITEM);
      }
      // F7.3's exact sentence, nothing else.
      return HttpResponse.json({ error: "This item is no longer in service" }, { status: 410 });
    }
    if (key !== "CNCS-AB12CD34" && key !== PRIVILEGED_ITEM.id) {
      return HttpResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return HttpResponse.json(getToken() ? PRIVILEGED_ITEM : PUBLIC_ITEM);
  }),

  http.get(`${API}/items/:id/tag`, () => (getToken() ? tagPng() : unauthorized())),

  http.post(`${API}/items/:id/tag/regenerate`, () =>
    getToken()
      ? HttpResponse.json({
          tagId: PRIVILEGED_ITEM.tagId,
          url: `http://localhost:5173/item/${PRIVILEGED_ITEM.tagId}`,
          dataUrl: "data:image/png;base64,PGZha2UtcG5nLWJ5dGVzPg==",
        })
      : unauthorized(),
  ),

  http.get(`${API}/items/:id/history`, () =>
    getToken() ? HttpResponse.json(HISTORY_FIXTURE) : unauthorized(),
  ),

  /**
   * `GET /loans/overdue` — the Property Officer's overdue-loan count. Behind
   * `authenticate`, so a tile that forgets the token must fail here rather than
   * hide itself as though nothing were overdue.
   */
  http.get(`${API}/loans/overdue`, () =>
    getToken() ? HttpResponse.json(OVERDUE_LOANS) : unauthorized(),
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

  /*
    Inbox housekeeping. Declared before the `/:id` ones so the literal paths read
    as the exception they are, but the shapes are distinct (`read-all` is one
    segment, `/:id` is two), so nothing here is order-sensitive.
  */
  http.post(`${API}/notifications/read-all`, () =>
    getToken() ? HttpResponse.json({ updated: 1 }) : unauthorized(),
  ),

  http.delete(`${API}/notifications/:id`, ({ params }) =>
    getToken() ? HttpResponse.json({ id: params.id, deleted: true }) : unauthorized(),
  ),

  http.delete(`${API}/notifications`, () =>
    getToken() ? HttpResponse.json({ deleted: 1 }) : unauthorized(),
  ),

  /**
   * Audit sessions (F9). The scan endpoint answers with the persisted row, whose
   * `result` is always FOUND — the same shape the real handler returns, so a page
   * that tried to submit its own result would fail these tests.
   */
  http.post(`${API}/audits`, () =>
    getToken() ? HttpResponse.json(AUDIT_SESSION, { status: 201 }) : unauthorized(),
  ),

  /** `GET /audits` — the history. Scoped server-side, so the handler ignores the query string. */
  http.get(`${API}/audits`, () => (getToken() ? HttpResponse.json(AUDITS_LIST) : unauthorized())),

  /**
   * The auditor's two tiles, declared **before** `${API}/audits/:id` — the same
   * ordering the router needs for the same reason (`/:id` matched "active" and
   * 404'd, which the tile rendered as "no active audit").
   */
  http.get(`${API}/audits/active`, () => (getToken() ? HttpResponse.json(ACTIVE_AUDIT) : unauthorized())),

  http.get(`${API}/audits/findings`, () =>
    getToken() ? HttpResponse.json(OPEN_FINDINGS_COUNT) : unauthorized(),
  ),

  /**
   * `GET /audits/:id` — the read-back. A completed session reports itself as
   * completed, which is what lets the walkthrough stop offering "Complete audit"
   * for a session the server would 409.
   */
  http.get(`${API}/audits/:id`, ({ params }) => {
    if (!getToken()) return unauthorized();
    const id = params.id as string;
    return HttpResponse.json(
      AUDIT_READBACK(
        id,
        id === COMPLETED_AUDIT_ID
          ? {
              completed: true,
              completedAt: "2026-09-22T08:30:00.000Z",
              counts: { found: 3, missing: 2, locationMismatch: 1 },
            }
          : {},
      ),
    );
  }),

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
   * Report exports (F10) — CSV or PDF, behind `authenticate`. The server defaults
   * `format` to `csv` (`z.enum(["csv", "pdf"]).default("csv")`), so a client that
   * forgot the parameter would still get a file; the download tests assert the
   * parameter explicitly anyway, and now cover the PDF path too.
   */
  http.get(`${API}/reports/inventory`, () => (getToken() ? csv() : unauthorized())),
  http.get(`${API}/reports/disposals`, () => (getToken() ? csv() : unauthorized())),
  http.get(`${API}/reports/audit/:auditId`, () => (getToken() ? csv() : unauthorized())),

  /**
   * The System Admin's two dashboard tiles. Both are behind `SYSTEM_CONFIG`, so
   * the token check is the same 401 the backend's `authenticate` sends — a widget
   * that forgets the header must fail here rather than render empty state.
   *
   * `events` is a bare array because that is what the route returns: the old
   * `{ data: [...] }` envelope is what made the consuming tile call `.map` on an
   * object (see `routes/systemConfig.ts`).
   */
  http.get(`${API}/system/status`, () => (getToken() ? HttpResponse.json(SYSTEM_STATUS) : unauthorized())),
  http.get(`${API}/system/events`, () => (getToken() ? HttpResponse.json(SYSTEM_EVENTS) : unauthorized())),

  http.get(`${API}/buildings`, () =>
    HttpResponse.json([
      { id: "bld-1", name: "CNCS Building", code: "CNCS-BLD" },
      { id: "bld-2", name: "Science Complex", code: "SCI-CMPLX" },
      { id: "bld-3", name: "Chemistry Building", code: "CHEM-BLD" },
      { id: "bld-4", name: "Physics Building", code: "PHYS-BLD" },
    ]),
  ),

  http.get(`${API}/users/transfer-recipients`, () =>
    HttpResponse.json([
      {
        id: "recipient-1",
        fullName: "Dr. Abera Test",
        email: "abera@cncs.aau.edu.et",
        role: "STAFF",
        departmentId: "cs-dept-id",
        departmentName: "Computer Science",
      },
    ]),
  ),
];
