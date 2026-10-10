# Frontend Phase 1 — Foundation & Public Lookup

Covers SRS F1 (auth shell), F3.4 (tag image), F4 (scan & public lookup — the flagship
feature), and F5.1 (location as text). Written after the phase merged, in the same spirit
as the backend's [`phase-1.md`](phase-1.md): what actually shipped, the decisions behind
it, and what Phase 2 needs to know.

## What shipped

| Route | Screen | File |
| --- | --- | --- |
| `/` | Landing: scan entry, search, recently added (F4.2) | `src/features/public/LandingPage.tsx` |
| `/items` | Browse: URL-held search / category / department + pagination | `src/features/items/ItemsBrowsePage.tsx` |
| `/scan` | Camera scan + manual tag entry (F4.1) | `src/features/public/ScanPage.tsx` |
| `/item/:tagId` | **QR destination** — role-filtered detail, `404`, `410` (F3.3/F4/F7.3) | `src/features/public/ItemDetailPage.tsx` |
| `/login` | Login (F1) | `src/features/auth/LoginPage.tsx` |
| `/dashboard` | Post-login shell home: pending badge, shortcuts, recent requests preview | `src/features/dashboard/DashboardPage.tsx` |
| `*` | Shared 404 for unmatched and not-applicable-to-role paths | `src/features/public/NotFoundPage.tsx` |

Also shipped: the design-token layer (`src/styles/tokens.css`, `globals.css`), the shared
component library (`src/components/`), the API client, the auth shell + guards, the test
harness (Vitest + RTL + MSW), CI (`/.github/workflows/frontend.yaml`), and the `frontend`
service in `docker-compose.yaml`.

## Architecture decisions

### One route tree, exported as data

`src/app/router.tsx` exports `appRoutes: RouteObject[]`. `main.tsx` builds a
`createBrowserRouter` from it; the tests build a `createMemoryRouter` from the *same*
array. The two can never disagree about which shell wraps which screen, and tests exercise
the real guards and layouts instead of hand-rolled route scaffolding.

Two shells, per `frontend-design-system.md` §9:

- **`PublicLayout`** — anonymous-inclusive surfaces (`/`, `/items`, `/scan`,
  `/item/:tagId`, `/login`) plus the catch-all 404. Minimal chrome; the top-right control
  changes with auth state, the layout does not.
- **`AppLayout`** — the authenticated workbench, wrapped in `RequireAuth`. One component
  renders both the desktop sidebar (`lg`+) and the mobile bottom tab bar from
  `visibleNavItems(role)`.

`QueryClientProvider` deliberately wraps the router in `main.tsx` rather than living inside
`RootProviders`: the auth provider needs `useNavigate` (so it must be inside the router),
while the query client has no router dependency — and keeping it outside lets each test
build the same tree with a fresh client.

### Phase-gated navigation

`src/app/navConfig.ts` carries `CURRENT_PHASE = 1`, and every nav entry declares the phase
that introduces it. `visibleNavItems()` filters on `phase <= CURRENT_PHASE`, so the shell
never links to a route that does not exist yet. Phase 2 appends entries and bumps the
constant; it does **not** restructure either layout.

### Auth

- Token in `localStorage`, rehydrated on boot with `GET /auth/me` — a stale token never
  renders a shell. The "no token" case is resolved in a lazy state initializer rather than
  an effect, so it cannot paint a shell for even one frame.
- Sign-out is client-side only (there is no logout endpoint): drop the token, clear the
  query cache.
- **401 is handled in exactly one place.** `lib/apiClient.ts` has no React or router
  dependency; it calls back into a handler that `AuthProvider` registers, which clears the
  token, clears the query cache, toasts, and redirects to `/login?next=…`.
- `RequireAuth` is UX, not security: an API 403/404 is the truth, and a role that cannot
  use a route gets the app's normal 404 — there is no separate "forbidden" page pretending
  to be a boundary the backend does not also enforce.

### Field visibility is a backend decision — this app only renders it

**The rule that must survive every phase:** field visibility is enforced server-side
(`backend/src/utils/filterItemFields.ts` → `sanitizeItem`). The frontend never
re-implements it and never adds hiding logic of its own.

`components/ItemDetailView.tsx` is the single item-rendering component, and it derives each
section only from keys actually present on the API response (`isPrivilegedItemView` checks
for `ownerId`). A public render is visibly shorter than a staff render — that difference
*is* the access control, not a bug to patch over. No screen may add its own
"show this if admin" branch.

The Phase 1 test suite asserts both directions: the anonymous render contains no cost,
owner, brand, model, serial, notes, or accessories; the staff render contains them.

### Public flow details

- **`/scan` needs a secure context.** The camera API does not exist on a plain-HTTP LAN
  origin, so `useQrScanner` decides up front and renders a *permission/environment*
  explanation, with manual tag entry always visible beside it — both paths resolve to the
  same `/item/:tagId` page. Demo devices must use `localhost` or HTTPS.
- **The QR target is a contract.** `qrGenerator.ts` encodes
  `${PUBLIC_BASE_URL}/item/:tagId` (default `http://localhost:5173`). If the frontend origin
  moves, `PUBLIC_BASE_URL` moves with it or every printed sticker scans to nothing. No test
  catches this on either side, because both are behaving correctly.
- **`410` is a designed state, not an error.** A disposed item seen by the public renders
  F7.3's exact sentence, "This item is no longer in service", and nothing else; signed-in
  staff/admin get the full record instead.
- **Filters live in the URL** (`?search=&categoryId=&department=&page=`), so a filtered
  list is shareable and Back/Forward restores it. There is deliberately no "show disposed"
  toggle: disposed items never appear in the default listing (server-enforced).
- **Search is by name and tag ID only.** Department has its own filter and category is a
  dropdown, because that is what `GET /items` actually supports.

### Tag image (F3.4)

`components/TagPanel.tsx` fetches `GET /items/:id/tag` through the authenticated blob
helper — a plain `<a href>` would send no Bearer token — and renders the QR preview plus a
PNG download. It is mounted on the item page for signed-in viewers, and it carries
`data-print-tag`, which opts it into the `@media print` stylesheet: printing produces the
QR image, the tag ID in mono, and the item name, with no app chrome.

`GET /items/:id/tag` looks items up **by id**, while the public item page navigates **by
tagId** — the panel is therefore fed `item.id` from the already-loaded item, not from the
route param.

### Requests groundwork

Phase 1's dashboard needs the pending badge, so `src/api/requests.ts`, `src/types/request.ts`
(`REQUEST_LIST_SELECT`'s exact shape) and `usePendingCount` (30s poll, paused when the tab
is hidden) already exist. Phase 2 reuses them for the queue screens rather than re-deriving
the contract.

The dashboard preview also established the request badge vocabulary
(`RequestStatusBadge` / `RequestTypeBadge` in `components/StatusBadges.tsx`) so Phase 2's
queue screens never invent their own status colours.

## Toolchain decisions and fixes

- **TypeScript pinned to `^6.0.3`, matching the backend.** The scaffold briefly pinned
  `^7.0.2`, which `typescript-eslint@8` cannot load (TS 7 is the new Go-based compiler and
  the plugin still uses the TS 6 API). Lint failed outright until the pin was aligned.
- **`baseUrl` removed from `tsconfig.app.json`** — deprecated in TS 6. `paths` resolves
  relative to the tsconfig directory on its own since TS 5.4.
- **`react-hooks@7`'s compiler-era rules** (`refs`, `set-state-in-effect`) are enabled via
  `eslint-plugin-react-hooks`'s flat config. They caught four real patterns in existing
  code: ref writes during render (`SearchBar`, `useQrScanner`), state syncing inside
  effects (`AuthContext` boot, `SearchBar` prop sync, `TagPanel` reload), all of which now
  use lazy initializers or the prev-state derivation pattern.
- **Optional props that callers forward `undefined` to are typed `?: T | undefined`.**
  Under `exactOptionalPropertyTypes`, `?` alone rejects an explicitly-passed `undefined`
  (React's `className` forwarding hits this constantly).
- **Lint carries one warning:** `AuthContext.tsx` exports both the provider and `useAuth`,
  which `react-refresh/only-export-components` warns about. Splitting the hook into its own
  file is cosmetic churn; it stays, as a warning that does not fail CI.

## Testing

`pnpm test` runs Vitest (jsdom) with React Testing Library. MSW mocks at the **network
layer**, so tests exercise the real `apiClient` — fetch, headers, error normalization and
all — rather than a stubbed hook. Handlers live in `src/test/msw/handlers.ts` and answer
401 for privileged endpoints without a token, exactly as the real `authenticate`
middleware does.

Suite (31 tests, 5 files):

| Area | File | What it locks down |
| --- | --- | --- |
| Money / dates / tag parsing | `src/lib/formatters.test.ts` | `"45000"` → `ETB 45,000.00` (hand-built, no `Intl` currency), UTC dates, relative time, `parseScannedTagId` for both a scanned URL and a typed tag |
| **Field-visibility matrix** | `src/features/public/ItemDetailPage.test.tsx` | Anonymous render carries no restricted field; staff render carries all of them; `404` and `410` render as designed states |
| Auth + guards | `src/test/authFlow.test.tsx` | Login stores the token and lands on `/dashboard`; server 401 message shown verbatim; anonymous `/dashboard` redirects to login; token rehydrates; mid-session 401 clears the token and redirects |
| Public flows | `src/test/publicFlow.test.tsx` | Search updates URL-held state → results → item page; the two empty states stay distinct; manual tag entry resolves; camera-less devices degrade with an explanation |
| Dashboard | `src/features/dashboard/DashboardPage.test.tsx` | Pending badge, requests preview, role-specific wording, empty queue |

The date-format assertion accepts `Sep` **or** `Sept`, because Node's ICU renders en-GB's
September abbreviation as `Sept` in current CLDR — exactly the locale-data instability
`frontend-plan.md` §13 warns about for currency. Formatting stays hand-built; only the
assertion is tolerant.

## How to run

```bash
# whole stack
docker compose up --build          # backend :4000, frontend :5173

# frontend alone
cd frontend
pnpm install
pnpm dev                           # http://localhost:5173
```

`frontend/.env.example` documents `VITE_API_BASE_URL` (default `http://localhost:4000`;
the client appends `/api/v1` itself). In `docker-compose.yaml` it is set to
`http://localhost:4000` deliberately — the React bundle runs in the *user's* browser, so it
must reach the backend's published host port, never the Docker service name.

Gates:

```bash
cd frontend
pnpm run lint      # eslint
pnpm run build     # tsc -b (type-checks tests too) + vite build
pnpm test          # vitest run
```

## Verification performed

- `pnpm run lint`, `pnpm run build`, and `pnpm test` all pass (31/31 tests).
- `docker compose up` brings up **both** services; `GET :4000/health` → `{"status":"ok"}`,
  `GET :5173/` → HTTP 200 with the app's `<title>CNCS Property</title>`.
- Against the real seeded backend: `GET /api/v1/items` returns the `{ data, pagination }`
  envelope the types model; an anonymous `GET /api/v1/items/:tagId` contains no privileged
  keys (field filtering confirmed live, not just mocked); login with the seed admin
  credentials returns a token and user.
- The frontend Docker image builds (`docker build ./frontend`), the same step CI runs.

## Known limits / notes for Phase 2

- **The `-src/generated/prisma` client must exist before the stack runs.** The backend
  container crash-looped with `ERR_MODULE_NOT_FOUND` until `pnpm exec prisma generate` was
  run in `backend/`; the mounted source tree is what the container executes, so generating
  on the host is part of "run the stack", not an optional step.
- **The bundle has one >500 kB chunk** (mostly `html5-qrcode`). It is a build warning, not
  an error; lazy-loading the scanner route is the obvious fix if it matters.
- **`lastAuditedAt` is present in the real public response** even though the frontend
  models it as a privileged-optional field. Harmless here (nothing public renders it), but
  it means `net` — not `ownerId` alone — should be the reference for "what the server sends
  anonymously" if that ever needs re-deriving.
- **A staff item detail page (`/items/:id`) does not exist yet.** The backend has no
  `GET /items/:id` (lookup is by `tagId`), so Phase 1 put `TagPanel` on the item page
  instead of inventing a page that cannot fetch its own record. History and accessories
  arrive with Phase 2, when that page (and the endpoint question) belong.
- **Form-draft persistence exists but is unused.** `lib/storage.ts` ships
  `saveDraft`/`loadDraft` (sessionStorage) for Phase 2's item/request forms — the
  mitigation for the 1-day JWT (gap G4) losing a half-written form on a mid-form 401.
- **No MSW service worker file is committed.** Tests use `setupServer` in Node; a browser
  worker is only needed for manual mocking and can be added with `pnpm msw init public`.
