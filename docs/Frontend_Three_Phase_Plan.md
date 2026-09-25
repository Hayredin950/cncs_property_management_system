# Frontend Delivery Plan — Three Phases
## CNCS Property Management System
**Version 1.0 | Depends on: SRS v1.0, SDS v1.0, Backend Three Phase Plan v1.0**

---

## 0. How This Works

The backend plan ran three groups through three 2-day phases (Days 1–6) and then moved the
whole team to the frontend. This plan picks up from there: **three frontend phases, each
2 days, sequential** — Phase 2 starts only once Phase 1 is merged into `main` and actually
runs in a browser, and Phase 3 the same. Frontend Phase 1 starts on **Day 7**; the three
phases end on **Day 12**, leaving Days 13–14 as buffer plus demo preparation.

Three groups, same model as the backend: how each group splits its internal tasks is up to
that group; this plan defines *what* ships and *when*, not who writes which line.

**Companion documents:** [`frontend-plan.md`](frontend-plan.md) is the functional
reference — the full route map, the API contract per screen, the SRS §3.4 field-visibility
table, and the list of places where the spec and the built backend disagree (`§12`,
referenced below as G1–G9).
[`frontend-design-system.md`](frontend-design-system.md) is the visual reference — colour,
type, spacing, every component's states, and a mobile + desktop blueprint for every screen.
This plan says what ships in which phase and what "done" means. Read all three together: the
two reference docs answer *how* and *what it looks like*, this one answers *when*.

Each phase below has a **goal**, a **feature list** (core + "go further" additions, since
AI-assisted coding lets a group of this size build past bare CRUD), **testing
requirements**, **documentation requirements**, and **exit criteria** — the exact bar that
must be true before the next group is unblocked.

---

## 1. Practices That Apply to All Three Phases (non-negotiable, from day one)

Same non-negotiables the backend ran on, adapted to the frontend.

### 1.1 Running the stack

- `docker compose up` stays the entire setup. Today `docker-compose.yaml` has **one**
  service, `backend` (the backend plan's `db` service was dropped when the team moved to
  hosted Neon) — Phase 1 adds a `frontend` service, so the file has two and nothing else
  changes shape after that.
- `frontend/Dockerfile` is written in Phase 1 and reused by every later phase. New features
  are new code inside the existing container, never a new service.
- `.env.example` is updated (not replaced): `VITE_API_BASE_URL` joins the existing backend
  variables. The real `.env` stays untracked.
- **One cross-cutting gotcha, worth stating once here:** the backend's `PUBLIC_BASE_URL`
  encodes the URL inside every printed QR sticker (`${PUBLIC_BASE_URL}/item/:tagId`,
  default `http://localhost:5173`). It must point at the frontend origin. If the frontend
  moves and this doesn't, every sticker in the demo scans to nothing — and no test catches
  it, because the backend is behaving correctly.
- Each phase's exit criteria include: "runs correctly via `docker compose up` with no manual
  steps outside the README."

### 1.2 Git branching

- `main` is protected — no direct pushes, only merges via Pull Request, one approving review.
- Branch naming follows `CONTRIBUTING.md` (`<track>/<short-description>`, lowercase, dashes):
  **`frontend/phase1-scaffold`, `frontend/phase2-requests`**, etc. The `frontend/` track
  keeps these clearly separate from the backend's `phase1/…`, `phase2/…`, `phase3/…`
  branches, which are already in the history.
- Commit messages say *what* and *why* in one line (`Render only the fields the API returns
  on the public item page`, not `fix item page`).
- Frontend work touches only `/frontend`, `.github/workflows/`, `docker-compose.yaml` and
  `docs/` — `backend/` is frozen. Anything needing a backend change is its own PR, per
  `CONTRIBUTING.md`.

### 1.3 CI/CD

`backend.yaml` already runs on every PR with **no `paths` filter**, and documents why: a
required check that never reports blocks a merge rather than passing it. That reasoning
applies exactly as much to the frontend.

Phase 1 adds a **second job without a path filter** — either `frontend.yaml` mirroring
`backend.yaml`, or a `frontend` job added to the existing workflow. It runs:

1. Install dependencies (`pnpm install --frozen-lockfile`, Node 22, pnpm — same as backend)
2. Lint (`eslint`), matching the backend's ESLint + Prettier setup
3. Type check / build (`tsc` — this type-checks the test files too, the trap that breaks
  backend CI)
4. Run unit tests (`vitest run`)
5. Build the Docker image

Every phase adds its tests into this same pipeline. By Phase 3 the pipeline tests the whole
frontend on every PR, not just the newest code. A PR that fails CI is not merged, no
exceptions.

### 1.4 Testing — per phase, not at the end

- Every phase writes tests **for the logic it introduces**, before the next phase starts.
  `vitest` + React Testing Library for components and hooks, **MSW** for API-level tests
  (it mocks at the network layer, so the real API client is exercised, not a stubbed hook).
- Priority is **business rules and edge cases over simple rendering**. The frontend's
  highest-priority rule is the same one the backend tested hardest: SRS §3.4 field
  visibility. A second, frontend-specific priority: the failure states a real user hits —
  `401`, `403`, `404`, `409`, `410`.
- Tests run in CI (§1.3) automatically. A phase is not "done" if its own tests don't pass.

### 1.5 Documentation & comments

- Each phase adds a `docs/frontend-phase-N.md`: what was built, decisions made, how to
  run/test it, and anything the next phase's group needs.
- The root `README.md` gains a **Frontend section** that each phase adds to (never
  rewrites) — by Phase 3 it is a complete "how to run the whole system" guide alongside the
  backend instructions already there.
- Phase 3 closes with `docs/frontend-handoff.md`, mirroring `docs/backend-handoff.md`.
- Comments on anything non-obvious, and *why* rather than *what* — assume the reader is a
  teammate in three weeks deciding whether they can change the line.
- **The rule that must survive every phase:** field visibility is enforced **server-side**
  (`utils/filterItemFields.ts` → `sanitizeItem`). The frontend never re-implements it and
  never adds its own hiding logic. It renders what the API sends and nothing more. Every
  phase should be able to point at that sentence in its own docs.

### 1.6 Visual design system

- [`docs/frontend-design-system.md`](frontend-design-system.md) is written, and its token
  layer (colour, type, spacing, breakpoints — that document's §3–§5) is implemented as
  `src/styles/tokens.css` plus the Tailwind theme extension **in Phase 1, before any feature
  screen ships** — the same "build the shared foundation first" logic Phase 1 already
  applies to the API client and auth shell.
- Treat that token file the way `CONTRIBUTING.md` treats `schema.prisma`: shared and
  effectively frozen once Phase 1 merges it. A later phase that needs a new colour or
  spacing value raises it and extends the design doc in its own PR, rather than hardcoding a
  one-off hex value inside a component.
- Every phase's screens are reviewed against that document's component specs (§8) and
  page-by-page blueprints (§10) before merging — a design review, not just a code review,
  and cheap now versus expensive after three phases of screens disagree with each other.

---

## 2. Phase 1 — Foundation & Public Lookup (Days 7–8)

### Goal

The app runs in Docker, and the system's flagship feature is live: **a visitor scans a
sticker and lands on a correct, role-filtered item page.** Plus everything Phases 2 and 3
build on top of — a shared API client, auth shell, test harness and CI.

F4 is named the flagship feature in the SRS, so it ships in Phase 1 rather than last. It is
also the phase that has to get the field-visibility rule right, because Phases 2 and 3 add
screens over the same items.

### Core deliverables (map to SRS F1, F3, F4, F5.1)

- **Scaffold:** React + Vite + TypeScript (strict) + Tailwind, React Router, TanStack Query,
  react-hook-form + zod, Vitest + RTL + MSW, ESLint + Prettier matching the backend;
  `frontend/Dockerfile`; a `frontend` service added to `docker-compose.yaml`;
  `.github/workflows/frontend.yaml` (no path filter — see §1.3).
- **Design tokens & base component library:** `frontend-design-system.md` §3–§5's colour,
  type, spacing and breakpoint tokens implemented as CSS variables plus a Tailwind theme
  extension, plus the shared components every later phase reuses — Button, Input, Select,
  Badge, Card, Table/ResponsiveList, Pagination, Modal/ConfirmDialog, Toast, Skeleton,
  EmptyState, ErrorState (that doc's §8). Built once, here, so Phase 2 and 3 screens are
  assembled from existing pieces instead of each phase growing its own button.
- **API client:** base URL from `VITE_API_BASE_URL`, always the **`/api/v1`** prefix; Bearer
  token attached automatically; every failure normalized into one `ApiError { status,
  message, details? }` so screens show the server's `error` string verbatim; a **blob
  download helper** (the QR tag PNG and all reports are auth-protected, so a plain
  `<a href>` would send no token — the download path exists from Phase 1 so Phase 3 doesn't
  discover this the hard way); one place handles `401` → clear token → `/login?next=…`.
- **Auth shell (F1):** login form, token storage and `GET /auth/me` rehydration on boot,
  role-aware navigation and layout, sign out (client-side only — there is no logout
  endpoint), and route guards. Public routes stay open; only staff/admin routes are guarded.
  "Layout" means both authenticated shells from `frontend-design-system.md` §9: a sidebar at
  `lg`+ and a five-item bottom tab bar (Home/Scan/Items/Requests/More) below it — not a
  sidebar that merely shrinks.
- **`/` landing and browse (F4.2):** search bar (by **name and tag ID** — that is what the
  API supports; department has its own filter and category is a dropdown, not free text),
  scan entry point, and paginated results via `GET /items` with `page`/`limit`/`search`/
  `categoryId`/`department`.
- **`/item/:tagId` — the QR destination (F4, F3.3):** renders exactly the SRS §3.4 field set
  for the current viewer, and handles the three real outcomes: the record, `404` for an
  unknown tag, and **`410` "This item is no longer in service"** for a disposed item seen by
  the public (F7.3). Building `410` as a designed state in Phase 1 is deliberate — it is the
  F7.3 behaviour the backend already ships, and it is easy to mistake for a network error later.
- **`/scan` (F4.1):** camera scanning with **`html5-qrcode`** (the library the SDS locked in)
  plus manual tag entry, which is always available and always resolves to the same page. The
  page must degrade with a clear explanation when the camera is unavailable — the browser
  camera API needs a **secure context**, so `localhost` works but a demo over a LAN IP on
  plain HTTP silently fails, and that must read as a permission problem, not a broken app.
- **Location as text (F5.1):** Building / Floor / Room on every item view. The SRS says this
  is not optional even when the map (F5.2) is cut, so it ships here and stays.
- **Tag image (F3.4):** staff/admin can view and download the QR PNG via
  `GET /items/:id/tag`, through the authenticated blob helper.

### Go further than the minimum

- Search, filters and page number in the **URL query string**, so a filtered list is
  shareable and browser back/forward works. Retrofitting this later means touching every list.
- Skeleton loaders and genuinely distinct empty states — "no items match these filters" must
  not look like "the request failed". This is what makes a demo read as finished rather than broken.
- Mobile-first layout pass on the public flow: the SRS delivery is a mobile-friendly site
  and this feature is used on a phone, held at arm's length from a sticker (SRS §2.3, §4 usability).
- A single item-rendering component that derives fields **only** from the API response, so
  no future screen invents its own "show this if admin" branch.
- Accessibility tooling wired in from day one: `eslint-plugin-jsx-a11y` in the ESLint config
  and `@axe-core/react` logging violations to the console in dev — cheap to add now, and it
  catches a missing label or a contrast miss on the very first screen instead of the last one.

### Testing requirements

- Unit: money formatting (the API sends `Prisma.Decimal` as **strings**, e.g. `"45000"`),
  date formatting in UTC, route guards, tag-ID parsing from a scanned URL.
- **Highest priority test in this phase:** the **field-visibility rendering matrix** — an
  anonymous/public render of `/item/:tagId` contains no purchase cost, current value, owner
  name, brand, model, serial number, notes or accessories; a staff/admin render does. This
  is the frontend half of the backend's most-tested rule.
- MSW-level tests for the failure states: `401` (and the redirect it triggers), `404`
  unknown tag, `410` disposed tag shown to the public.
- One flow test: manual tag entry → item page, and search → result → item page.
- A manual responsive pass against `frontend-design-system.md` §13's device matrix for every
  screen this phase ships (`/`, `/scan`, `/item/:tagId`, `/login`) — 375px width with zero
  horizontal scroll is the check that catches the most regressions later.

### Documentation

- `README.md`: a Frontend section — `pnpm dev` in `frontend/`, how it joins
  `docker compose up`, `VITE_API_BASE_URL`, and the `PUBLIC_BASE_URL` ↔ frontend-origin rule
  from §1.1.
- `docs/frontend-phase-1.md`: where the API client lives, how auth is stored and
  rehydrated, the QR/`PUBLIC_BASE_URL` dependency, and — critically — the note that field
  visibility is a **backend** decision this app only renders, pointing at
  `utils/filterItemFields.ts` and `frontend-plan.md` §5. Every later phase adds screens over
  the same items and needs that sentence.

### Exit criteria (must be true before Phase 2 starts)

- [ ] `docker compose up` brings up backend **and** frontend with zero manual steps beyond `.env`
- [ ] CI is green on `main` with the frontend job included
- [ ] A logged-out visitor can scan or type a seeded tag and see the item's text location, with no restricted field anywhere in the response or the page
- [ ] The field-visibility matrix test passes, and the team understands it as the rule no screen may bypass
- [ ] `404` and `410` both render as designed states, not generic errors
- [ ] Every screen shipped this phase is built from `frontend-design-system.md` tokens and components — no ad-hoc hex codes or one-off spacing values
- [ ] The public flow (`/`, `/scan`, `/item/:tagId`) is verified at 375px, 768px, and 1280px with no horizontal scroll, no overlapping elements, and no input that triggers iOS auto-zoom
- [ ] `docs/frontend-phase-1.md` and the README Frontend section are complete enough that someone who wasn't in this group could run and extend the app cold

---

## 3. Phase 2 — Staff & Admin Workflows (Days 9–10)

### Goal

Everything that turns browsing into managing: item registration and editing, bundled
accessories, the transfer/disposal approval chain, and notifications — all built on Phase 1's
client, auth shell and layouts.

This is the phase that must keep the "one rule, one implementation" discipline from §1.5.
The request and edit screens touch the same items the public page shows; none of them may
re-introduce field hiding.

### Core deliverables (map to SRS F1.3, F2, F3, F6, F7, F8)

- **Item registration and editing (F2.1, F2.3, F2.4):** `/items/new` and `/items/:id/edit`
  with the full field set, a category dropdown from `GET /categories`, the
  `DepartmentPicker` in its free-entry mode (`frontend-design-system.md` §8 — suggests known
  department values, still accepts a new one), and zod validation mirroring the server's. A
  **disposed item opens read-only with an explanation** rather than a form that cannot save
  — the API answers `409`, and `PUT` can never un-dispose anything.
- **`parentItemId` is never submitted.** The API rejects it with a 400 pointing at the
  accessories endpoint; bundles are linked only through `POST /items/:id/accessories`.
- **Photo is a URL field, not an upload (F2).** `photoUrl` accepts a URL string and there is
  **no upload endpoint** (gap G3) — so no file picker that has nowhere to post.
- **Accessory bundles (F2.2):** link and unlink on the item page, with the server's
  self-parent / cycle / depth errors surfaced as readable messages rather than raw 409s.
  F2.2 exists specifically to fix "the office never tracked whether the laptop had a bag",
  so the bundle reads as a real list, not just another field.
- **Tags (F3.4, F3.5):** print/download the sticker and `POST /items/:id/tag/regenerate`,
  with copy that says plainly that the *sticker* is replaced and the Tag ID is unchanged. The
  print path is a real `@media print` stylesheet (`frontend-design-system.md` §10.6) — QR
  image, mono tag ID, item name, no app chrome — not a "save as PDF and hope" workaround.
- **Item history (F2.3, F6.3):** a history view over `GET /items/:id/history`, **grouped by
  `editedAt`**. Rows written by one approval share an exact timestamp, so grouping is what
  turns "17 rows changed" into "admin approved this transfer, and its 3 accessories came along".
- **Requests (F6, F7):** `/requests` (staff see their own, admin sees the review queue, with
  `status`/`type` filters, rendered with the `Table ⇄ ResponsiveList` component so the queue
  is usable on a phone), `/requests/new` (the form switches fields on `TRANSFER` vs
  `DISPOSAL` — the API 400s on the wrong combination, so the form must not offer it), and
  `/requests/:id` with approve/reject `ConfirmDialog`s for admins, each stating the specific
  consequence per `frontend-design-system.md` §11 (not a bare "Are you sure?"). The rejection
  reason is required (3–500 chars). A second request on an item already holding a pending
  one is `409` — link the user to the existing request instead of dead-ending them.
- **Notifications (F8.1, F8.2):** `/notifications` inbox, icon/colour branching on the
  `code` field (`REQUEST_SUBMITTED` / `REQUEST_APPROVED` / `REQUEST_REJECTED`, or `null`),
  mark-as-read, an unread badge polled on an interval (paused when the tab is hidden), and
  the admin's `GET /requests/pending-count` badge in the nav.
- **Admin (F1.3, F2.4):** `/admin/users` to create staff/admin accounts and
  `/admin/categories` to add categories. Note carefully that the backend supported **create
  only** for users at the time (gap G2) — the screen created, it did not list or edit. (Since
  closed: `GET/PATCH/DELETE /users` and category rename/delete both exist and both screens
  manage rather than only create.)

### Go further than the minimum

- Optimistic mark-as-read, and a global error boundary so one broken screen doesn't blank the app.
- Confirmation dialogs on approve, reject and regenerate — the three actions a live demo
  should never fire by accident.
- A notification badge in the browser tab title, which is how a reviewer actually notices
  something is waiting (F8.2's acceptance criterion is "a reviewer never has to manually
  check for pending requests").
- Debounced search and a sticky filter bar on the item list, carried from Phase 1.

### Testing requirements

- Approval flow: staff calling approve gets `403`; admin approval updates the item and adds
  history rows; **a requester cannot decide their own request**; a decided request cannot be
  re-decided; reject without a reason is refused client- and server-side.
- Disposal: an approved disposal leaves active browse but stays in history and reports; the
  edit screen is read-only for a disposed item.
- Bundles: self-parent, cycle and depth errors each render a readable message.
- Notifications: created on submission and on decision; the unread count updates; marking
  read is scoped to the caller.
- Validation parity: the client rejects what the server rejects (reason length,
  disposal-with-transfer-fields, missing required item fields).

### Documentation

- `docs/frontend-phase-2.md`: the request/approval UI state machine explained plainly, where
  notifications are consumed, and the notification `code` vocabulary. Phase 3's audit and
  report screens read from the same items and need the same history semantics.
- README updated with the staff/admin screens and the **seed credentials** needed to reach
  them (`admin@cncs.aau.edu.et` / `Admin123!`, `staff@cncs.aau.edu.et` / `Staff123!`).

### Exit criteria (must be true before Phase 3 starts)

- [ ] A staff account can register an item, edit it, bundle an accessory, and see every change in that item's history
- [ ] A transfer **and** a disposal each run request → decision → applied change entirely through the UI
- [ ] The requester is notified in-app on the decision, and the reviewer sees a pending badge without refreshing
- [ ] Self-approval is impossible from the UI and still provably blocked server-side
- [ ] Field visibility is still only in one place — no screen added its own hiding logic
- [ ] Every approve/reject/regenerate action requires its `ConfirmDialog` with the specific consequence stated — none fires from a single click
- [ ] The requests queue and item list are usable at 375px as card lists, not a horizontally-scrolled table
- [ ] CI green, now covering Phase 1 + Phase 2 frontend tests together
- [ ] `docs/frontend-phase-2.md` complete

---

## 4. Phase 3 — Audit, Reporting & Frontend Wrap-Up (Days 11–12)

### Goal

The scan-assisted audit walkthrough, exportable reports, and a final pass that makes the
whole frontend — all three phases combined — demoable and genuinely handed off. This is the
phase that decides what gets cut, explicitly, rather than running out of time and leaving it
ambiguous.

### Core deliverables (map to SRS F5.2, F9, F10)

- **Audit (F9):** `/audit/new` (department scope only — the backend completes only
  `DEPARTMENT`, and other scope types are accepted at creation then fail at completion) with
  the `DepartmentPicker` in its **locked** mode — a dropdown of department values derived
  from `GET /items`, never free text, because completion matches `scopeValue` against
  `Item.department` exactly and case-sensitively (gap G9, `frontend-plan.md` §12),
  `/audit/:id/scan` (the live walkthrough: scans are recorded `FOUND` and the client keeps a
  running list of what *this* session has scanned, because there is no server-side scan
  listing), and `/audit/:id/report` rendering the completion summary — `found`, `missing`,
  `locationMismatch` (F9.3) — straight from the completion response.
- **Reports (F10.1, F10.3):** `/reports` with the filters each export supports (inventory:
  department, category, status, date range; disposals: department, date range; audit: the
  session). All three download through the **authenticated blob helper** built in Phase 1.
  Dates are UTC and `dateTo` includes the whole day — label the range as UTC so a user
  doesn't silently lose or gain a day. CSV only; `?format=` anything else is a 400, not a
  silent JSON fallback (F10.2's PDF is deliberately not built).
- **`/map` (F5.2):** buildings highlighted from the location data already captured, linking
  to the items in each. **This is the first thing cut if Phase 3 runs short** (SRS §7 cut
  order) — F5.1's text location from Phase 1 already satisfies the underlying need.
- **Accessibility and responsiveness pass** across every screen; empty / loading / error
  states verified on every list, including the ones added this phase.
- **`/admin/users`** reflects what the API can actually do, with any remaining limitation
  stated on the page rather than discovered.

### Go further than the minimum

- Keyboard-first approval and scan flows: the audit walkthrough is used holding a phone,
  one-handed, which is exactly where a mouse-shaped layout fails.
- PWA-lite touches (`theme-color`, `apple-touch-icon`, a minimal manifest for "Add to Home
  Screen") for staff who scan repeatedly through a shift — cheap given the icons already
  exist for the favicon (`frontend-design-system.md` §2).
- A small health indicator off `GET /health` — cheap, and it turns "is the backend up?" from
  a demo-day guess into a visible answer.

### Testing requirements

- **Full-walkthrough test:** sign in as admin → register an item → bundle an accessory →
  file a transfer → approve it → start an audit → scan → complete → download all three
  CSVs, asserting the request the UI makes at each step.
- Report downloads: correct query parameters, correct filename, `format=csv` present, and
  the auth header attached — the bug a plain `<a href>` hides.
- Audit: completing an already-completed session is refused (`409`), a client cannot supply
  its own result, and the rendered summary matches the API's counts.
- **Full-frontend regression:** one deliberate pass confirming nothing from Phases 1–2
  broke, since CI now runs all three phases' tests together.

### Documentation

- `docs/frontend-phase-3.md`: the audit and report UI flows, the CSV download mechanism, and
  the known limits (CSV only, duplicate scan rows in the audit export that the completion
  logic deduplicates).
- `docs/frontend-handoff.md`, mirroring `docs/backend-handoff.md`: what's built, what's
  deliberately cut and why (map, PDF, real email), the spec-vs-backend gaps restated for
  whoever picks this up, and — one more time — that field visibility is server-enforced and
  the frontend must never duplicate it.
- Final README pass: the version a reader actually opens. Full route list, env vars, seed
  credentials, and the demo script (the exact click path for a walkthrough).

### Exit criteria (must be true before the team calls the frontend done)

- [ ] An audit session runs start → scan → complete through the UI, and its summary matches the API's counts
- [ ] All three reports download valid CSV from the browser with the auth header attached
- [ ] Every SRS **P0** screen is reachable and usable across the full `frontend-design-system.md` §13 device matrix, not just one phone size
- [ ] `/map` is either shipped or explicitly recorded as cut, with F5.1 text location verified everywhere
- [ ] A full accessibility pass (`frontend-design-system.md` §12 checklist) is complete on every P0 screen — not just the ones Phase 1 covered
- [ ] No screen anywhere in the app uses a colour, spacing value, or component state absent from `frontend-design-system.md`
- [ ] `docker compose up` still brings up the whole system with zero manual steps beyond `.env`
- [ ] Full CI pipeline (all three phases' tests) green on `main`
- [ ] `docs/frontend-handoff.md` is complete and understandable by someone who has only ever touched the backend

---

## 5. What's Next

Once Phase 3's exit criteria are met, the frontend is delivered. Before Phase 1 starts,
everyone on the team reads [`frontend-plan.md`](frontend-plan.md) **and**
[`frontend-design-system.md`](frontend-design-system.md) — the first is the functional
contract, the second is what every screen in this plan actually looks like at every screen
size. Three things should be waiting on the other side of Phase 3:

1. **The day-by-day breakdown within Phase 1** — mirroring the offer the backend plan ended
   with, since that is the phase the team starts first.
2. **Answers to the decisions that block Phase 1**, all listed in
   [`frontend-plan.md`](frontend-plan.md) §14: the spec-vs-backend gaps (**G1** — no
   `GET /audits/:id/report`; **G2** — no user list/manage endpoints; **G3** — no photo upload
   endpoint; **G9** — no department lookup), token storage, whether camera scanning is
   required for the demo, brand assets, and who owns the frontend track. None of these are
   frontend-fixable. *(G1, G2 and G3 have since been closed by the backend — only G9, no
   `GET /departments`, is still open.)*
3. **The frontend workstream split** (SDS §5 proposes Public / Staff-Admin / Audit-Reports).
   That split determines how each phase's group divides internally — which, per §0, is the
   one thing this plan deliberately leaves to the group itself.
