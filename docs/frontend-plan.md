# Frontend plan (draft for review)

> **Status: proposal — nothing here is built.** This plans the `/frontend` app that consumes
> the backend in [`backend-handoff.md`](backend-handoff.md).
>
> **This is the reference document; the schedule lives in
> [`Frontend_Three_Phase_Plan.md`](Frontend_Three_Phase_Plan.md).** That plan says what ships
> in which phase and what "done" means; this one says how each piece works. Read them together.
>
> **Colour, type, layout and every screen's wireframe live in
> [`frontend-design-system.md`](frontend-design-system.md).** That document is the visual
> contract — exact tokens, component states, responsive behaviour per breakpoint, and a
> mobile + desktop blueprint for every route below. Nothing in it overrides a rule in this
> document; it only styles what this document and the backend already decided.
>
> **Sources reconciled:** the repo's own docs, plus the authoritative
> `SRS_CNCS_Property_Management_System` and `SDS_CNCS_Property_Management_System` (held
> outside the repo in `~/Documents/cncs/`) and the property-office meeting notes. Where the
> SDS and the built backend disagree, [§12](#12-gaps-between-the-spec-and-the-built-backend)
> records it — those gaps need a decision before the frontend is built against them.

## 1. Scope

All of SRS F1–F10, with the SRS's own priorities and cut order. The SRS names F4
(scan & public lookup) the flagship feature, so it comes first, not last.

| SRS | Feature | Pri | Frontend surface |
| --- | --- | --- | --- |
| F1 | Auth & role assignment | P0 | Login; role-aware shell |
| F2 | Item registration & editing | P0 | Register, edit, accessory linking, edit history |
| F3 | Barcode/tag generation | P0 | Tag image view/download/print, regenerate |
| F4 | **Scan & public lookup** | P0 | `/scan`, `/item/:tagId` (the QR target), search |
| F5.1 | Location as text | P0 | Building/Floor/Room on every item view |
| F5.2 | Campus map | P1 | `/map` — **the single feature cut first** |
| F6 | Transfer workflow | P0 | File request, list, admin review + approve/reject |
| F7 | Disposal workflow | P0 | Same flow with `type: DISPOSAL`; disposed states |
| F8 | Notifications | P1 | Inbox + unread badge (email is a stub) |
| F9 | Scan-assisted audit | P1 | Start session, live scan, report |
| F10 | Reporting & export | P1 | CSV downloads (PDF not built) |

**Out of scope** (SRS §8 and the built backend): MOFED integration, offline mode, native
apps, consumables, GPS, automatic email-domain role detection, PDF export, real email.

## 2. Stack

The SDS §1 **locks** the stack, and the backend already realizes its choices. Alignments
and the few places reality differs:

| Concern | Choice | Note |
| --- | --- | --- |
| Framework | React + Vite | SDS-locked |
| Styling | Tailwind CSS | SDS-locked |
| Language | TypeScript, `strict` | Matches `backend/tsconfig.json` |
| Routing | React Router (data router) | Nested layouts, guards, route-level loading |
| Server state | TanStack Query v5 | Caching, retries, badge polling |
| Forms | react-hook-form + zod | zod is already a backend dependency; client schemas mirror the server's |
| QR scanning | **`html5-qrcode`** | SDS §1 names this; do not substitute |
| Icons | lucide-react | |
| Toasts | sonner | |
| Design tokens | CSS variables + Tailwind `@theme` | `frontend-design-system.md` §3.5 — shared/frozen the same way `schema.prisma` is (see that doc's §14) |
| Fonts | `@fontsource/inter`, `@fontsource/jetbrains-mono` | Self-hosted, no Google Fonts runtime request — see `frontend-design-system.md` §4 |
| Tests | Vitest + React Testing Library + MSW | Same runner as the backend |
| Package manager | pnpm | Matches backend and CI |

**Deviation from SDS §1:** the SDS specifies `bcrypt` and `multer`. The built backend uses
**argon2id** (backend decision, irrelevant to the frontend) and has **no file-upload
endpoint at all** — see [§12](#12-gaps-between-the-spec-and-the-built-backend).

**No global state library.** Auth (token + user) is a context; everything else is server
state. Redux/Zustand would be a third place to keep data the API already owns.

## 3. Repo layout

The SDS §1 monorepo — `/backend` and `/frontend` side by side. The frontend mirrors the
backend's self-contained conventions (own `package.json`, `tsconfig.json`, `Dockerfile`,
colocated `*.test.tsx`).

```
frontend/
  src/
    api/          # one module per backend router: auth.ts, items.ts, requests.ts, ...
    app/          # router, providers, layouts, route guards
    components/   # Button, Table, Badge, Pagination, EmptyState, Scanner, ...
    features/     # public/, items/, requests/, audits/, reports/, notifications/, admin/
    hooks/        # useDebounce, useMediaQuery, useAuth, useUnreadCount, ...
    lib/          # apiClient, queryClient, formatters, storage
    styles/       # tokens.css (design tokens — frontend-design-system.md §3.5), globals.css
    assets/       # favicon/app icons, brand mark SVG, the static map image (F5.2)
    types/        # API types + enums mirrored from schema.prisma
```

Branch naming follows the repo's `CONTRIBUTING.md` (`<track>/<short-description>`), **not**
the SDS §6 `feature/...` — the repo rule supersedes the spec draft.

## 4. API client and auth

- **Base URL:** `VITE_API_BASE_URL` (default `http://localhost:4000`), always the
  **`/api/v1`** prefix per SDS §1/§3.
- **Token:** the JWT from `POST /auth/login`, in `localStorage`, rehydrated on boot with
  `GET /auth/me` (a stale token must not render a shell).
- **Login accepts more than the plain "email" label implies:** the request field is `email`,
  but the backend also matches a custom `id` (`auth.ts`'s `loginSchema` accepts
  `id`/`emailOrId`/`identifier` as aliases of the same value). Every seeded and
  admin-created account today has only an email, so the login form only needs one input
  labelled "Email" — just don't assume the API rejects anything that isn't email-shaped.
- **The auth response shape is flatter than it looks:** `POST /auth/login`, `POST
  /auth/register`, and `GET /auth/me` all return the user **twice** — nested under
  `user: {...}` and again spread at the top level (`id`, `name`, `fullName`, `email`, `role`,
  `createdAt`), plus `token` (login only) or `message` (register only). Read from the nested
  `user` object consistently so a future response cleanup on the backend doesn't require
  touching every call site.
- **Header:** attached automatically to every request.
- **401:** handled in one place — clear the token, redirect to `/login?next=<path>`.
- **Errors:** every failure is `{ error: string }`, plus `details` for a zod failure.
  Normalize to `ApiError { status, message, details? }`; show `error` verbatim (those
  strings are user-facing by design).
- **Binary responses need `fetch`, not `<a href>`:** `GET /items/:id/tag` (QR PNG) and all
  report endpoints are auth-protected, so a plain link sends no token. Both go through the
  client and become an object URL / Blob download.
- **Decimals are strings:** privileged item responses carry `purchaseCost`/`currentValue` as
  `"45000"`. Types model them as `string`; format with a hand-written `formatCurrencyETB()`
  helper that prefixes `"ETB "` and groups thousands itself — `en-ET` ICU data for Birr isn't
  guaranteed to resolve correctly in every browser, so don't depend on
  `Intl.NumberFormat(..., { style: "currency", currency: "ETB" })`.
- **List/detail response envelopes are not one shared shape — read the actual route before
  assuming:**

  | Endpoint | Envelope |
  | --- | --- |
  | `GET /items` | `{ data: Item[], pagination: { page, limit, total, totalPages } }` |
  | `GET /requests` | `{ requests: Request[], total, limit, offset }` |
  | `GET /requests/:id` | `{ request: Request }` |
  | `POST /requests/:id/approve` / `/reject` | `{ request, itemChanges, cascadedItemIds, editLogRowCount, notification, emailStatus }` |
  | `GET /notifications` | `{ notifications: Notification[], unreadCount, limit, offset }` |
  | `GET /items/:id/history` | `{ item, entries: EditLogEntry[], total, limit, offset }` |

  Two different pagination key-names (`pagination.total` vs. a bare `total`) across two
  endpoints is a real inconsistency in the built API, not a typo in this table — model each
  response with its own type rather than a single generic `Paginated<T>`.

## 5. Roles and field visibility

Two stored roles, `ADMIN` and `STAFF`. **Public is not a role** — it is the absence of a
valid JWT (SDS §2). The UI therefore has three viewer states: anonymous, staff, admin.

The SRS §3.4 table is the contract, and `sanitizeItem` already implements it server-side
(the SDS's "is this the owner" check = logged in as Staff/Admin **and** `user.id ===
item.ownerId`):

| Field | Owner | Staff/Admin | Public |
| --- | --- | --- | --- |
| Tag ID, Name, Category, Department, Location, Photo, Condition | ✅ | ✅ | ✅ |
| Owner/custodian name | ✅ | ✅ | ❌ |
| Purchase cost, Current value | ✅ | ✅ | ❌ |
| Brand, Model, Serial number | ✅ | ✅ | ❌ |
| Accessories, Notes | ✅ | ✅ | ❌ |
| Edit history | ❌ | ✅ | ❌ |

Two rules the UI must obey:

1. **Never hide instead of enforce.** Guards and hidden buttons are UX, not security. If the
   API answers 403/404, that is the truth.
2. **Render only what the response contains.** Do not render a placeholder "—" for a field
   the server deliberately withheld; its absence *is* the access control.

## 6. Route map

The **SDS §4 page map is authoritative** — these are its routes, with the additions this
plan proposes marked ➕ (each because a built backend capability has no page in the SDS map).

| Route | Who | Purpose | Endpoints |
| --- | --- | --- | --- |
| `/` | everyone | Landing + search bar + scan button (F4.2) | `GET /items`, `GET /categories` |
| `/item/:tagId` | everyone | **QR destination.** Role-filtered detail; the 410 disposed case | `GET /items/:tagId` |
| `/scan` | everyone | Camera scan → redirect to `/item/:tagId` (F4.1) | — |
| `/login` | staff/admin | Login | `POST /auth/login` |
| `/dashboard` | staff/admin | Quick links: add item, pending requests, start audit | `GET /requests/pending-count` |
| `/items/new` | staff/admin | Registration form (F2) | `POST /items`, `GET /categories` |
| `/items/:id/edit` | staff/admin | Edit form; read-only when disposed | `PUT /items/:id` |
| `/requests` | staff/admin | List, filterable by status | `GET /requests`, `GET /requests/pending-count` |
| `/requests/new` | staff/admin | File transfer or disposal | `POST /requests`, `GET /items` |
| `/requests/:id` | staff/admin | Detail; approve/reject for admin | `GET /requests/:id`, `POST /requests/:id/approve`, `POST /requests/:id/reject` |
| `/audits` | staff/admin | Audit history: past sessions, counts, CSV | `GET /audits` |
| `/audit/new` | staff/admin | Start a session, pick scope | `POST /audits` |
| `/audit/:id/scan` | staff/admin | Live scanning during a walkthrough | `POST /audits/:id/scan`, `GET /audits/:id` |
| `/audit/:id/report` | staff/admin | Mismatch report | `POST /audits/:id/complete`, `GET /audits/:id`, `GET /reports/audit/:auditId` |
| `/reports` | staff/admin | Report generation/export | `GET /reports/inventory`, `/reports/disposals` |
| `/map` | everyone | **P1 — cut first** (F5.2) | `GET /items` (derived from location data) |
| `/admin/users` | admin | Create staff/admin accounts (F1.3) | `POST /auth/register` ⚠️ |
| `/admin/categories` | admin | Manage categories (F2.4) | `GET /categories`, `POST /categories` |
| ➕ `/items` | everyone | Dedicated browse/paginated list (the SDS folds this into `/`) | `GET /items` |
| ➕ `/notifications` | signed in | F8 inbox — **the SDS page map has no notifications page** | `GET /notifications`, `POST /notifications/:id/read` |
| ➕ `/item/:tagId` → history tab | staff/admin | Edit trail (F2.3, F6.3) | `GET /items/:id/history` |
| ➕ `/items/:id` | staff/admin | Staff item detail by id (tag image, accessories) | `GET /items/:id/tag`, tag regenerate, accessory link/unlink |
| ➕ `*` (catch-all) | everyone | 404 for any unmatched path — a role-scoped page that doesn't apply to the current viewer resolves here too (`frontend-design-system.md` §9.1), never a separate "forbidden" page | — |

⚠️ = the SDS promises an endpoint the backend does not have. See §12.

**`/item/:tagId` is a contract, not a free choice:** `qrGenerator.ts` encodes
`${PUBLIC_BASE_URL}/item/:tagId`, default `http://localhost:5173`. If the frontend host
changes, `PUBLIC_BASE_URL` changes with it or every printed sticker breaks.

Layout, navigation shape (sidebar vs. bottom tab bar), and a mobile + desktop wireframe for
every route above are in [`frontend-design-system.md`](frontend-design-system.md) §9–§10 —
this table is the contract, that document is the blueprint.

## 7. Feature detail and edge cases

### Auth (F1)
- Login takes one input labelled "Email" + password. There is **no public sign-up**;
  account creation is admin-only (`/admin/users`). See §4 for the backend's more flexible
  (but for this system's real accounts, functionally email-only) identifier matching.
- Sign-out is client-side only (no logout endpoint): drop the token, clear the query cache.
- **F1.4 says a session lasts until explicit logout**; the built backend issues a **1-day
  JWT with no refresh**, so users are logged out daily. The frontend cannot fix this — see
  §14, question 2. It can soften it: decode the JWT's `exp` client-side (no network call) and
  fire a warning toast ~5 minutes before expiry (copy in `frontend-design-system.md` §11),
  and persist in-progress form input (item registration/edit, a request's reason field) to
  `sessionStorage` on every change so a mid-form 401 redirect to `/login?next=<path>` doesn't
  cost a half-written form. Both are pure frontend mitigations for a backend limitation the
  team may not resolve before launch.

### Scan & public lookup (F4) — flagship
- `/scan` uses `html5-qrcode` over the device camera (no native app, no scanner hardware).
- **Camera access requires a secure context.** `localhost` counts; a LAN IP over plain HTTP
  does not. Demo devices must hit `localhost` or HTTPS, or the scan page dies silently.
- Manual tag entry is always available alongside the camera (F4.1: both resolve to the same page).
- `GET /items/:tagId` → item for anyone, restricted per §5.
- **Disposed item for the public → `410 { error: "This item is no longer in service" }`**,
  and nothing else (F7.3). Render as a designed state, not a generic error. Signed-in
  staff/admin get the full record instead.
- Unknown tag → `404`. Both are real states of a physical sticker and both get screens.
- Search (F4.2) is by **name and tag ID** (`GET /items?search=`); department has its own
  `?department=` filter and category is filtered by id. "Search by category name" is not
  supported — offer a category **dropdown**, not free-text category search.

### Item browse (F5.1)
- `GET /items?page=&limit=&search=&categoryId=&department=`; `limit` defaults to 20, caps at
  100. Response `{ data, pagination }`.
- Debounce search; keep filters in the URL so a filtered list is shareable and back/forward works.
- Disposed items never appear in the default listing — server behavior, so **no "show
  disposed" toggle** the API cannot honor.

### Item create/edit (F2)
- Fields: name, category (`GET /categories`), department, building, floor, room, owner,
  purchaseCost, optional currentValue, condition, brand/model/serialNumber/**photoUrl**/notes.
- **`parentItemId` must never be sent** — the API 400s and points at the accessories
  endpoint. Bundles are linked only via `POST /items/:id/accessories` (`{ accessoryItemId }`
  or `{ accessoryItemIds: [...] }`, max 20, depth ≤ 2).
- **Photo is a URL field, not an upload** — `photoUrl` accepts a URL string and there is no
  upload endpoint (§12). Do not build a file picker that has nowhere to post.
- A disposed item is read-only (`PUT` → 409). Open the edit screen read-only with an
  explanation rather than letting a user fill a form that cannot save.
- Edit history rows are written server-side, one per changed field. `GET /items/:id/history`
  returns rows from a single approval sharing an exact `editedAt`, so the view **groups by
  timestamp** to show one decision (cascaded accessories included) as one event.

### Requests and approvals (F6, F7)
- `POST /requests` with `{ type, itemId, reason }` (reason 10–1000 chars). `TRANSFER` must
  name a new location and/or owner; `DISPOSAL` must name neither — the server 400s on the
  wrong combination, so the form switches fields on `type`.
- One PENDING request per item; a second is `409`. Surface it as a link to the existing
  request, not a dead end.
- Staff see their own requests; a staff lookup of someone else's is `404`, never `403` — the
  UI must not imply otherwise.
- Only admins approve (`403` for staff), and the requester cannot decide their own request.
- Reject requires `rejectionReason` (3–500 chars) — the dialog must not submit empty.
- `GET /requests/pending-count` drives the admin nav badge.

### Notifications (F8)
- `GET /notifications?unread=&limit=&offset=` → `{ notifications, unreadCount }`. Each item
  carries `code` (`REQUEST_SUBMITTED` | `REQUEST_APPROVED` | `REQUEST_REJECTED` | `null`)
  and `relatedRequestId`. Branch icon/colour on `code`; an unknown/absent code still renders
  its `message`.
- Poll `unreadCount` on a short interval, paused when the tab is hidden.
- `POST /notifications/:id/read` marks one read (IDOR-safe server-side).
- **Email is a logged stub** — copy must never promise an email was sent.

### Audits (F9)
- Start: `POST /audits` with `scopeType` + `scopeValue`. The SDS lists
  `DEPARTMENT | BUILDING | ALL`, but **only `DEPARTMENT` can complete** — other scopes 400
  at completion. Offer `DEPARTMENT` only.
- **`scopeValue` must exactly, case-sensitively match `Item.department`.** Completion filters
  with `where: { department: session.scopeValue, status: "ACTIVE" }` — no `mode:
  "insensitive"`, unlike the search filter on `GET /items`. There is also **no `GET
  /departments` endpoint** (`department` is a free-text column on `Item`, not a lookup
  table) — gap G9 in §12. The scope picker must therefore be a locked dropdown of department
  values *derived* from `GET /items`, never a free-text field, or a one-character typo
  silently produces an audit with zero in-scope items and every scan reported as a mismatch.
- Scan: `POST /audits/:id/scan` with `{ itemId }`. Clients cannot choose the result; scans
  are recorded `FOUND` and classified at completion.
- Complete: returns `{ counts: { found, missing, locationMismatch }, ... }` — render that
  directly. `GET /audits/:id` reads the same summary back and `GET /audits` lists sessions with
  their timestamps and counts (G1, closed), so the report survives a reload and a past audit is
  reachable at `/audits` instead of being CSV-only.
- The running scan list is seeded from `GET /audits/:id` and cached in `sessionStorage`
  (`lib/auditWalkthrough.ts`, `mergeStoredScans`). Only `scannedAt !== null` rows count as
  scans — `MISSING` rows are written by completion and were never scanned.

### Reports (F10)
- **CSV only** (`format=csv`; anything else is 400) and staff/admin only, so they download
  through the authenticated client into a Blob.
- Inventory filters: `department`, `categoryId`, `status`, `dateFrom`, `dateTo`. Disposals:
  `department`, `dateFrom`, `dateTo`. Audit: path param `auditId`.
- Dates are UTC and `dateTo` includes the whole day — label the range as UTC so a user does
  not silently lose or gain a day.

### Admin
- `/admin/users`: `fullName`, `email`, `password`, `role`. Duplicate email → 409. **There is
  no user list, update, or delete endpoint** — the page can create accounts but cannot
  "manage" them (§12).
- `/admin/categories`: `name` is unique; duplicate → 409.

### Map (F5.2 — P1, cut first)
- SDS §4 puts `/map` on everyone's nav. No backend work needed: derive building
  groups from `GET /items` location fields onto a static layout image. The meeting notes
  confirm no map exists today and treat it as a later-phase feature. **Build this last.**

## 8. Cross-cutting UX

- **Every colour, font size, spacing value, breakpoint, and component state used below is
  defined once, in [`frontend-design-system.md`](frontend-design-system.md).** This section
  states the *rules*; that document states the exact tokens and per-screen layouts that
  satisfy them. No screen invents its own hex code, spacing value, or status colour.
- **Mobile-first, not merely responsive.** The SRS §2.3 delivery is a mobile-friendly site
  and the flagship flow is a phone scanning a sticker; design the public/scan paths on a
  phone viewport first, then expand to desktop. Concretely: the anonymous shell is a plain
  top bar with no chrome to spare, and the authenticated shell swaps a desktop sidebar for a
  five-item bottom tab bar (Home/Scan/Items/Requests/More) below the `lg` breakpoint, not a
  squeezed-down sidebar or a hamburger hiding the primary actions
  (`frontend-design-system.md` §9).
- **Zero-training public flow** (SRS §4 usability): scan → item page must be understandable
  with no instructions.
- **Tables become card lists below `lg`, never a horizontally-scrolling table.** A table
  that requires side-scrolling on a phone is not a responsive table.
- **Every list** has loading, empty, and error states — "no items yet" and "the request
  failed" must not look alike, and "no items yet" and "no items match these filters" are two
  different empty states with two different messages (copy bank in
  `frontend-design-system.md` §11).
- **Every mutation** toasts and invalidates the affected queries.
- **Every irreversible action confirms first, with the specific consequence stated** —
  approve, reject, tag regeneration, completing an audit. "Are you sure?" alone is not a
  confirmation; "This will mark CNCS-DEMO-0003 as disposed and can't be undone" is.
- **Role-aware shell:** nav renders only routes the role can use; unknown and
  not-applicable-to-this-role routes both resolve to the same 404 (§6) — there is no separate
  "forbidden" page pretending to be a frontend-enforced boundary the backend doesn't also
  enforce.
- **Accessibility:** labelled inputs, keyboard-reachable forms, focus management on dialogs,
  a skip-to-content link, 44×44px minimum touch targets below `lg`; colour is never the only
  signal for status or condition — every status chip pairs colour with an icon and a text
  label. Full checklist in `frontend-design-system.md` §12.
- **Mobile form inputs are never smaller than 16px.** iOS Safari auto-zooms the viewport on
  focusing a smaller input — an easy-to-miss bug that makes a form feel broken on exactly the
  device class this app targets.
- **One shared vocabulary** for `PENDING`/`APPROVED`/`REJECTED`, `ACTIVE`/`DISPOSED`,
  `NEW`…`BEYOND_REPAIR`, mirrored from `schema.prisma` in `src/types/`, and one fixed
  colour/icon per value (`frontend-design-system.md` §3.2) — never redefined per screen.
- **Currency is Ethiopian Birr, formatted by hand, not by locale data** — see §4.
- **Dates and times are UTC, and say so.** Every date range picker (reports, audit filters)
  and every absolute timestamp shown in full is labelled UTC; notification timestamps show a
  relative form ("2h ago") with the absolute UTC time available on hover/long-press.
- **A missing or broken `photoUrl` never renders a broken-image icon.** `photoUrl` is an
  unvalidated URL string (no upload endpoint exists — §12), so every image slot is a fixed
  aspect-ratio frame with a category-based placeholder as its `onError` fallback.
- **Network failure is not the same UI as a 4xx/5xx.** Detect `navigator.onLine` /
  connection-level fetch failures and show a distinct "you're offline, showing the last data
  we loaded" state rather than the generic server-error screen.
- **Filter, search, and page state live in the URL** (already required for `/items`) — this
  also means the browser's Back button from a detail page restores the exact list state the
  user left, not a reset list.
- **A print stylesheet ships for the tag view** (`frontend-design-system.md` §10.6): the QR
  image, the tag ID in mono, and the item name print on their own page with no app chrome —
  "print the sticker" needs no separate export step (F3.4).
- **HTTPS in production** (SRS §5) is also a functional requirement, not just security:
  the camera API needs a secure context.

## 9. Configuration

| Variable | Used by | Value |
| --- | --- | --- |
| `VITE_API_BASE_URL` | frontend | `http://localhost:4000` |
| `PUBLIC_BASE_URL` | backend (existing) | must equal the frontend origin so QR codes point at `/item/:tagId` |

## 10. Testing and quality gates

Matching the backend's bar — gates run in CI, not after:

- **Unit/component:** Vitest + RTL for forms, visibility rules, formatting, history grouping.
- **API integration:** MSW handlers built from the handoff contract, covering the failures
  that matter: 401, 403 (staff approving), 404 (scoped request), 409 (disposed/pending), 410
  (disposed public tag).
- **Visibility tests are mandatory**, not optional: assert that an anonymous `/item/:tagId`
  render contains no cost, owner name, brand/model, or notes — the SRS calls this the rule
  that cannot be skipped.
- **Lint/typecheck:** `pnpm run lint` and `pnpm run build` (build type-checks tests too — the
  trap the backend documented).
- A frontend CI job alongside `backend.yaml`.

## 11. Delivery schedule

The schedule is the three sequential 2-day phases in
[`Frontend_Three_Phase_Plan.md`](Frontend_Three_Phase_Plan.md) — that document is
normative, and this is how each screen above lands in it:

| Phase | Days | SRS covered | Screens from §6 |
| --- | --- | --- | --- |
| 1 — Foundation & Public Lookup | 7–8 | F1, F3, F4, F5.1 | `/`, `/items`, `/scan`, `/item/:tagId` (incl. 410), tag image, login + shell |
| 2 — Staff & Admin Workflows | 9–10 | F1.3, F2, F6, F7, F8 | `/dashboard`, `/items/new`, `/items/:id/edit`, history, accessories, `/requests*`, `/notifications`, `/admin/*` |
| 3 — Audit, Reporting & Wrap-Up | 11–12 | F5.2, F9, F10 | `/audit/new`, `/audit/:id/scan`, `/audit/:id/report`, `/reports`, `/map`, polish |

Ordering follows the SRS priority list: **P0 first**, then P1, with `/map` (F5.2) last as
the designated cut. Days 13–14 stay as buffer and demo preparation.

## 12. Gaps between the spec and the built backend

Found by reconciling the SDS/SRS against the actual routes. Each needs a decision before the
frontend is built against it — none is fixable in the frontend alone.

| # | Spec says | Reality | Impact on frontend |
| --- | --- | --- | --- |
| ~~G1~~ | SDS §3.5: `GET /audits/:id/report` returns a session's full results | **Closed.** `GET /audits/:id` returns the stored rows and the same `counts`/id-lists the completion response did, and `GET /audits` lists sessions with their counts and timestamps | `/audit/:id/report` reads a session back, and `/audits` is the audit history; neither depends on the completion response still being in memory |
| ~~G2~~ | SDS §4: `/admin/users` — "create/**manage** staff accounts, assign roles" | **Closed.** `POST /auth/register` (Admin-only) creates; `GET /users` lists every account with `itemCount`; `PATCH /users/:id` corrects name/email; `POST /users/:id/promote` grants ADMIN (**no demote**, by design); `POST /users/:id/password` resets and forces a change; `DELETE /users/:id` removes an account with no trail | `/admin/users` is a real management table, and the item form's custodian picker reads `GET /users`, so an Admin registers an item for whoever holds it. `GET /users` stays Admin-only, so a Staff registrar sees only their own account there |
| G3 | SDS §1: `multer` file uploads to `/uploads`; SRS F2 lists Photo | **Closed.** `POST /uploads/photo` now stores an image and returns its URL (see `docs/backend-handoff.md`); `photoUrl` accepts an absolute URL *or* a site-relative path (`utils/photoSource.ts`) | The form takes a photo from the camera, the device, or a URL (`PhotoField`), in both create and edit mode |
| G4 | SRS F1.4: session lasts until explicit logout | **1-day JWT, no refresh endpoint** | Users are logged out daily; nothing the frontend can do about it |
| G5 | SDS §4 nav has no notifications page; F8 is P1 | Backend fully supports notifications | This plan adds `/notifications` ➕ and a nav badge; confirm placement with whoever owns the shell |
| G6 | SDS §2 enum comment says public users aren't stored | Correct and already true — no `PUBLIC` role exists | Frontend must treat "no token" as the public state, not a role value |
| G7 | SDS §6: branch as `feature/<name>` | Repo `CONTRIBUTING.md` requires `<track>/<short-description>` | Follow the repo, not the spec |
| G8 | SDS §2: `AuditItemResult_Row` "rename freely" | Renamed to `AuditItemResultRow` in the real schema | None — just don't copy the SDS's model names into frontend types |
| G9 | Audits (SDS §3.5) imply department is a known, structured value | `department` is a free-text `String` on `Item`; there is no `Category`-style `GET /departments` endpoint, and audit completion matches `scopeValue` against it exactly and case-sensitively | The audit-scope picker cannot be free text (a typo silently zeroes the scope) but also cannot query a real list — it derives a best-effort set of known values from `GET /items` and locks the field to that set (`frontend-design-system.md` §8, `DepartmentPicker`, locked mode) |

## 13. Risks and known rough edges

Restated from the handoff because they are frontend-visible:

- **No OpenAPI spec.** Types in `src/types/` are hand-written from this doc and the routes;
  they drift silently. A shared/generated contract is a worthwhile follow-up.
- **Privileged cost fields are strings** until the API shape changes deliberately.
- **Audit CSV exports duplicate scans** that completion deduplicates. The UI cannot fix this
  and should not present either number as authoritative.
- **No test database** (backend) — mocked route tests mean some contract details are
  unverified against real Postgres.
- **Email is a stub** — in-app notifications are the only real channel.
- **Camera needs a secure context** — a common demo-day failure that looks like a broken app.
- **`department` is uncontrolled free text** (G9) — inconsistent capitalisation or spacing
  across items (e.g. "Computer Science" vs. "computer science ") silently breaks an audit's
  scope match. Worth a backend follow-up (a `Department` lookup table, or at least
  normalizing on write) even though the frontend cannot fix it alone.
- **`en-ET` currency formatting is not guaranteed across browsers** — format Birr amounts
  with a hand-written helper, not `Intl.NumberFormat`'s `currency` option (§4, §8).

## 14. Open questions for review

1. **Frontend ownership** — SDS §5 proposes three frontend workstreams (Public,
   Staff/Admin, Audit & Reports). Is that the split, and who takes each?
2. **Session length (G4)** — accept daily re-login, or add a refresh-token/longer-expiry
   endpoint to the backend before the frontend encodes the 1-day assumption?
3. **The three spec-vs-backend gaps (§12)** — for each of G1/G2/G3: build the missing
   backend endpoint, or drop the corresponding UI from v1?
4. **UI kit** — hand-rolled components, or adopt shadcn/ui (Radix + Tailwind) for dialogs,
   tables, and forms?
5. **Token storage** — `localStorage` (survives refresh, XSS-reachable) vs in-memory (safer,
   logs out on refresh). No refresh endpoint exists, so this is the real trade-off.
6. **Is camera scanning required for the demo**, or is manual tag entry sufficient? This
   decides whether `/scan` ships in M1 or slips to M6.
7. **Frontend deployment** — separate container in `docker-compose.yaml`, static build
   served by the backend, or dev-only for now? The SDS §7 defers deployment.
8. **Brand assets** — the property office has no logo/wordmark on file today
   (`frontend-design-system.md` §2 ships a placeholder text lockup). Is a real logo coming,
   or does the placeholder become the permanent mark?
9. **Department data hygiene (G9)** — is a real `Department` lookup (its own table, or at
   minimum a distinct-values endpoint) worth a small backend follow-up, given audits depend
   on an exact string match against free-text input?
