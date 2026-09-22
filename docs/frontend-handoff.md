# Frontend handoff

Everything a reader needs to pick this up cold. Mirrors
[`backend-handoff.md`](backend-handoff.md) in shape and intent: what exists, the rules you must
not break, what was deliberately left out, and how to run it. Written for someone who has only
ever touched the backend.

## What's built

A React 19 + Vite + TypeScript (strict) + Tailwind 4 single-page app, three phases of work,
shipped as the `frontend` service of the repo's single `docker compose up`.

**Public — no sign-in required.** These are the surfaces a visitor or a QR sticker reaches:

| Route | What it does |
| --- | --- |
| `/` | Landing + search by name or tag ID, with a scan entry point (F4.2) |
| `/items` | Paginated browse: search, category, department filters |
| `/scan` | Camera scan + manual tag entry, for everyone (F4.1) |
| `/item/:tagId` | The QR destination — the QR-payload contract, see below (F4.3) |
| `/map` | Buildings grouped from item locations, each linking into its items (F5.2) |
| `/login` | Staff sign-in (F1.1) |

**Staff / Admin — behind `RequireAuth`:**

| Route | What it does |
| --- | --- |
| `/dashboard` | Pending-review stat, shortcuts, queue preview |
| `/items/new`, `/items/:id/edit` | Register / edit an item (F2.1, F2.3) |
| `/items/:id` | Staff workbench: QR tag, accessories bundle, edit history (F2.2, F3.4, F6.3) |
| `/requests`, `/requests/new`, `/requests/:id` | Queue, file a transfer/disposal, approve or reject (F6, F7) |
| `/notifications` | In-app inbox with mark-as-read (F8) |
| `/audit/new`, `/audit/:id/scan`, `/audit/:id/report` | Audit walkthrough and completion summary (F9) |
| `/reports` | Inventory / disposals / audit CSV exports (F10.1, F10.3) |
| `/admin/users`, `/admin/categories` | Admin-only, create-only (see gaps) |
| `*` | The 404 — also what a role-scoped route renders for the wrong role (never a separate "forbidden" page) |

**Foundation:** one API client (`lib/apiClient.ts`) that attaches the Bearer token, normalizes
every failure to `ApiError { status, message, details }`, handles `401` in exactly one place
(clear token → `/login?next=…`), and provides the authenticated **blob** download path. One auth
context (`app/AuthContext.tsx`), one TanStack Query client, one shared component library
(`src/components/`), one nav config (`app/navConfig.ts`), an error boundary per shell
(`app/AppErrorBoundary.tsx`), and a token layer in `src/styles/tokens.css` that the design doc
treats as frozen.

**Testing:** `vitest` + React Testing Library + MSW (`src/test/`). Nine suites, run in CI on every
PR alongside lint and the type-checking build.

## Field visibility is a backend rule — do not re-implement it

The one rule that must survive every future change, said the same way the backend handoff says
it:

> Field visibility is enforced **server-side** — `backend/src/utils/filterItemFields.ts`
> (`sanitizeItem`), applied on every route that can return an item. The frontend **renders what
> the API sends and nothing more**. It never re-implements the filter and never adds its own
> "hide this unless admin" branch.

In practice that means: any screen showing an item uses the shared `ItemDetailView`, and no
component inspects `user.role` to decide which fields to draw. The test that guards this is the
field-visibility matrix (`features/public/ItemDetailPage.test.tsx`), which asserts on the
*absence* of privileged keys for an anonymous viewer. `types/item.ts` types the privileged fields
as optional precisely because the public shape omits them outright rather than nulling them.

## Contracts you must not break

### `/item/:tagId` is not a free choice

`backend/src/utils/qrGenerator.ts` encodes `${PUBLIC_BASE_URL}/item/:tagId` inside every printed
sticker. The frontend route (singular `item`) and the backend's `PUBLIC_BASE_URL` (default
`http://localhost:5173`) must stay in step, or every sticker in the field scans to a dead page.
Nothing in CI catches a drift here, because both sides are behaving correctly. Note the
deliberate asymmetry: `/item/:tagId` is the public route, `/items/:id` is the staff one.

### Downloads are fetched, never linked

The QR tag PNG and all three report CSVs sit behind `authenticate`. A plain `<a href>` sends no
`Authorization` header, so it would save a 401 body under a `.csv` name. Everything binary goes
through `apiClient.blob()` → `downloadBlob()`.

### Audit results are the server's to decide

`POST /audits/:id/scan` accepts only `{ itemId }`. Result classification happens at completion,
server-side. A UI that submits its own result is a bug, not a shortcut.

### `html5-qrcode` throws synchronously — never call `stop()` unguarded

`Html5Qrcode.prototype.stop()` does `throw "Cannot stop, scanner is not running or paused."` — a
*string*, *synchronously* — unless the machine is already `SCANNING`/`PAUSED`. `start()` marks
the scanner `SCANNING` only once the camera has rendered, so the unsafe window is wide: any stop
while a start is in flight (StrictMode's throwaway mount, navigating away during the permission
prompt, a denied prompt). Thrown from an effect cleanup it bypasses every `.catch()` and takes
the whole app down with React Router's default error screen.

`hooks/useQrScanner.ts` checks `getState()` first, keeps a `try`/`catch` around it, and closes
the camera from the `start()` continuation if it resolves after unmount. `src/test/qrScanner.test.tsx`
guards all of it — do not simplify those paths away.

## What was deliberately cut, and why

- **`/map` as a real map.** No coordinates or tiles exist in the schema. It ships as building
  grouping, which answers the actual question. The SRS cut order lists F5.2 first; it survived as
  this.
- **PDF exports (F10.2).** Stretch item, never built. `/reports` states this rather than offering
  a disabled button. CSV only, `?format=` anything else is a 400.
- **Real email (F8.3).** The backend gates a stub transport behind `NOTIFY_EMAIL`; the frontend
  only knows in-app notifications.
- **A `canReview` role.** Approval is ADMIN-only; the SRS leaves the reviewer role unresolved and
  ADMIN-only needs no migration.
- **`ResponsiveList`** (design doc §8's table ⇄ card component). Queues and tables render as card
  lists today.
- **Request `itemChanges` display.** Approve/reject succeed and state the consequence, but the
  "what changed" list from the API response isn't surfaced yet.
- **A PNG icon set.** The PWA manifest points at the existing favicon SVG.

## Spec-vs-backend gaps the frontend ran into

These are places where the SDS/SRS describe something the built API cannot do. The UI states each
one on the page rather than failing silently.

| # | Gap | Consequence in the UI |
| --- | --- | --- |
| G1 | No `GET /audits/:id` and no `GET /audits` list | The audit's running scan list and completion summary live in browser storage; a cold visit to `/audit/:id/report` shows a deliberate "not available" state |
| G2 | No user list / role-change endpoints | `/admin/users` and `/admin/categories` **create only**; no listing, no editing. Item owner select is limited to your own account |
| G3 | No upload endpoint | Photo is a **URL** field with a preview, never a file picker — a file picker would have nowhere to post |
| G4 | 1-day JWT, no refresh | Sessions end after a day of inactivity even though F1.4 says until explicit logout |
| G9 | No `GET /departments` | Department lists are derived from one page of `GET /items`; the audit picker is locked to those values because completion matches `scopeValue` exactly and case-sensitively |

Backend-side note recorded here so it isn't rediscovered as a frontend bug: **duplicate scan rows
appear in the audit CSV.** The scan endpoint appends a row per accepted call; completion
deduplicates for classification. Two devices scanning one item → two export rows, one result.

## Running it

```bash
docker compose up --build      # whole system; frontend on http://localhost:5173
```

Environment: `frontend/.env.example` holds `VITE_API_BASE_URL` (default
`http://localhost:4000`, **without** the `/api/v1` prefix — the client appends it). It is baked
into the browser bundle at dev/build time, so it must be the backend's published *host* address,
never a Docker service name. The root `.env`'s `PUBLIC_BASE_URL` must point at the frontend
origin.

Seed credentials: `admin@cncs.aau.edu.et` / `Admin123!`, `staff@cncs.aau.edu.et` / `Staff123!`.

Without Docker:

```bash
cd frontend && pnpm install
pnpm dev        # dev server
pnpm run lint
pnpm run build  # tsc -b + vite build — type-checks test files too
pnpm test       # vitest + RTL + MSW
```

CI (`.github/workflows/frontend.yaml`) runs lint → build → test → docker build on every PR, with
no `paths` filter on purpose: a required check that never reports blocks a merge rather than
passing it.

## A demo script, in order

A walkthrough that touches every phase, in the sequence that tells the story:

1. **Anonymous lookup.** Open `/` in a private window. Search a seeded item by name or tag.
2. **The flagship flow.** Go to `/scan`, type a seeded tag (the camera needs a secure context —
   use `localhost`, not a LAN IP over plain HTTP), land on `/item/:tagId`, and note that the
   sensitive fields are simply absent.
3. **Disposed tag.** Look up the seeded disposed item as an anonymous visitor — F7.3's exact
   sentence and a 410, not a 404.
4. **Staff work.** Sign in as staff. `/items/new` to register an item (tag ID generated for you),
   then open the item and link an accessory.
5. **Request.** From the item, "File transfer / disposal" → `/requests/new`, submit a transfer.
6. **Approval.** Switch to the admin account, open `/notifications` (the requester's filing is
   there), then `/requests` → approve. The pending badge on the Requests nav item drops.
7. **Audit.** `/audit/new`, pick the department, scan or type tags on `/audit/:id/scan`, then
   complete. The summary's found/missing/wrong-location counts come straight from the API.
8. **Reporting.** Download the audit CSV from the completion screen, then `/reports` for the
   inventory and disposals exports. Confirm each saves a real file with a session's credentials.
9. **Resilience.** Stop the backend container and reload — the footer's health indicator says
   "System unreachable" in words, not just a red dot.

## Where to read next

- [`frontend-plan.md`](frontend-plan.md) — functional reference: route map, per-screen API
  contract, the SRS §3.4 field-visibility table, and gaps G1–G9 in full.
- [`frontend-design-system.md`](frontend-design-system.md) — colour, type, spacing, component
  states, and a mobile + desktop blueprint for every screen.
- [`Frontend_Three_Phase_Plan.md`](Frontend_Three_Phase_Plan.md) — what shipped when.
- [`frontend-phase-1.md`](frontend-phase-1.md), [`frontend-phase-2.md`](frontend-phase-2.md),
  [`frontend-phase-3.md`](frontend-phase-3.md) — the per-phase decision records.
- [`backend-handoff.md`](backend-handoff.md) — the API side of everything above.
