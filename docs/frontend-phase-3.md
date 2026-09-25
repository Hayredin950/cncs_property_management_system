# Frontend — Phase 3: Audit, Reporting & Wrap-Up

**Status: shipped.** Days 11–12 of [`Frontend_Three_Phase_Plan.md`](Frontend_Three_Phase_Plan.md)
§4. Builds on Phase 1's client/auth shell and Phase 2's staff workflows — read
[`frontend-phase-1.md`](frontend-phase-1.md) and [`frontend-phase-2.md`](frontend-phase-2.md)
first. The consolidated handoff is [`frontend-handoff.md`](frontend-handoff.md).

## What shipped

| Feature | Route | Files |
| --- | --- | --- |
| Start an audit (department scope) | `/audit/new` | `features/audits/AuditNewPage.tsx` |
| Live scan walkthrough | `/audit/:id/scan` | `features/audits/AuditScanPage.tsx` |
| Completion summary | `/audit/:id/report` | `features/audits/AuditReportPage.tsx` |
| CSV exports (inventory / disposals / audit) | `/reports` | `features/reports/ReportsPage.tsx` |
| Browse by building | `/map` | `features/public/MapPage.tsx` |
| "Is the backend up?" | public footer | `components/HealthIndicator.tsx`, `api/system.ts`, `hooks/useHealth.ts` |
| PWA-lite (Add to Home Screen) | — | `public/manifest.webmanifest`, `index.html` |
| Error containment | both shells | `app/AppErrorBoundary.tsx` |

Supporting layer: `api/audits.ts`, `api/reports.ts`, `hooks/useAudits.ts`,
`types/audit.ts`, `types/report.ts`, and `lib/auditWalkthrough.ts`.

## The audit flow, and why it looks like this

### Reading an audit back (gap G1 — closed)

The API this phase was built against exposed exactly three audit calls: create, scan, complete.
There was no `GET /audits/:id` and no `GET /audits` list, and the first version of this phase
worked around that by keeping the walkthrough in `sessionStorage`. `GET /audits/:id` and
`GET /audits` now exist, which changes what storage is *for*:

- **The running scan list is the server's.** `AuditScanPage` seeds its list from
  `GET /audits/:id` and merges in the scans this tab has made
  (`lib/auditWalkthrough.ts` → `mergeStoredScans`), persisting to `sessionStorage` only as a
  cache for the seconds before that request lands. The old behaviour — an empty list in a new
  tab while the server held every scan — is what made a saved audit look unsaved.
- **The completion summary is a read-back, not a one-shot.** `POST /audits/:id/complete`
  returns `counts` / `found` / `missing` / `locationMismatch` and the report still renders them
  from router state so the landing is instant, but a cold visit to `/audit/:id/report` now
  falls back to the stored session instead of a "summary isn't available" state.
- **`/audits` is the history.** Sessions by date with their scope, runner, status and counts,
  each linking to its report and its CSV — the screen that turns a stored audit into something
  findable rather than CSV-only.

### Department scope only, through the *locked* picker

Completion 400s (`Unsupported scopeType`) for anything but `DEPARTMENT`, and it matches
`scopeValue` against `Item.department` **exactly and case-sensitively** — a free-text
department silently zeroes an audit's scope (gap G9). So `/audit/new` offers
`LockedDepartmentPicker` (a `Select` of departments already present on items), never the
free-entry picker the item form uses. Offering another scope type would create sessions that
can never be finished.

### A scan is never the client's decision

`POST /audits/:id/scan` takes **only** an `itemId`; `result` is written `FOUND` server-side and
the final classification is computed at completion. `AuditScanPage` proves it: the scan test
asserts the request body is exactly `{ itemId }`. A scanned sticker resolves to an item first
(`parseScannedTagId` + `GET /items/:tagId`), and a tag matching nothing — or a disposed one —
reads as a failed scan with the tag echoed back, never as a silent success.

### Completing twice is refused, not retried

The endpoint is not idempotent: completing an already-completed session answers `409`. The UI
confirms before calling (a `ConfirmDialog` stating what `missing` / `wrong location` will mean),
never retries on its own, and surfaces the server's own string when it fails. Completion stamps
`lastAuditedAt` on found items, so the item queries are invalidated.

## Reports

All three exports go through `apiClient.blob()` — never a plain `<a href>`. The endpoints sit
behind `authenticate`, so a bare link sends no Bearer token and cheerfully downloads a 401 body
named `.csv`. The download tests assert the `Authorization` header explicitly for exactly that
reason, alongside:

- `format=csv` on every request (anything else is a 400, not a JSON fallback — F10.2's PDF is
  deliberately not built, and `/reports` says so instead of offering a dead button);
- the filename, which mirrors the server's own `YYYY-MM-DD` stamp
  (`inventory-report-2026-09-22.csv`);
- each export's supported filters and nothing more — inventory: department, category, status,
  registered-date range; disposals: department, decided-date range; audit: the session id.

Dates are labelled **UTC** in the UI and `dateTo` includes the whole UTC day, because a bare
date range silently gains or loses a day otherwise. A start-after-end range is caught client-side
with the reason stated, mirroring the server's `superRefine`, so the request never leaves.

## `/map` (F5.2) — shipped, with its limit stated

The SRS cut order names `/map` as the first thing to drop. It ships as **buildings, not a
floorplan**: no map tiles or coordinates exist anywhere in the schema, and inventing a
geographic view would be fiction. Items are grouped by the `building` they already carry and
link to their public `/item/:tagId` page — which is the real question ("what's in Building 3?")
that F5.1's text location also answers.

The page states its own limit: `GET /items` caps `limit` at 100, so this is the register's first
page, not a paginated crawl of the whole inventory. It says so on screen rather than showing a
subset as if it were everything.

## Accessibility, responsiveness, and the "go further" items

- **Five mobile slots, not seven.** `AppLayout`'s bar is Home / Scan / Items / Requests / More;
  the overflow destinations and Sign out live in the More sheet, because seven equal-width tabs
  shrink touch targets below 44px (`frontend-design-system.md` §12).
- **The reports sections are named regions.** Two of the three exports filter by "Department";
  without a region name a screen-reader user hears the same combo-box label twice with no way to
  tell which report it belongs to. `role="region"` + `aria-label` fixes that (and is what makes
  the two addressable in tests).
- **Never colour-only.** `HealthIndicator` states its verdict in words as well as a dot, and
  its three states are distinguishable without colour at all.
- **PWA-lite:** `theme-color`, `apple-touch-icon` and a minimal manifest for "Add to Home
  Screen" — staff scan repeatedly through a shift. The manifest points at the existing favicon
  mark; a real PNG icon set is still a follow-up (recorded in `frontend-handoff.md`).

## Testing

`src/test/auditReporting.test.tsx` — 10 tests, written against MSW so the real `apiClient`
(fetch, headers, error normalization) is exercised rather than a stubbed hook:

| Test | Proves |
| --- | --- |
| start → scan → complete renders the API's counts | the walkthrough works end to end, and the report shows 3/2/1 from the response — not a client recomputation |
| a scan sends only `{ itemId }` | a client cannot declare its own audit result |
| already-completed session → 409 | the API's string is surfaced, nothing is retried |
| unknown tag → failed scan | a bad sticker is never a silent success |
| all three CSVs carry the auth header + `format=csv` | the bug a plain `<a href>` hides |
| reversed date range | caught client-side; the request is never sent |
| `/map` groups by building | the link target stays the QR contract's singular `/item/:tagId` |
| register an item | `POST /items` carries no `parentItemId` |
| bundle an accessory, then reach the request form | `POST /items/:id/accessories` is `{ accessoryItemIds: [...] }`, and the item's request link lands on a *pre-filled* form |
| file a transfer, then approve it once | `POST /requests` carries the transfer fields; approval fires exactly once, through the `ConfirmDialog` |
| audit → scan → complete → every export | the audit's own export plus all three from `/reports`, each with `format=csv` |

The plan asks for one cross-phase walkthrough (§4, "Full-walkthrough test"). It runs as four
focused cases instead of one fifteen-screen mega-test, deliberately: the plan's requirement is
the walkthrough's *coverage* — one request asserted at each step — and a single test that long
spends most of its life rendering under parallel load, where a failure names nothing useful.
Same steps, same assertions; a failure now names the step that broke — which is exactly what
surfaced the `?item=` bug below, which the mega-test had been stepping *around* rather than
through.

Two suites were added alongside it for the crash and the boundary described below:
`src/test/qrScanner.test.tsx` (4 tests) and `src/test/errorBoundary.test.tsx` (2 tests).

> The crash below is the reason to distrust "it works on my machine" here: `/scan` renders
> perfectly with no camera and in jsdom (where `navigator.mediaDevices` doesn't exist at all), so
> the existing scan test passed throughout. The bug only existed on a real device with a real
> camera — and only on the paths that unmount mid-start, which is why the regression test mocks
> the *library's* state machine instead of the browser's.

Three harness fixes came out of writing these:

- **`GET /items/:id/history` had no MSW handler.** It only surfaced once a test rendered the
  staff item page, which no Phase 1–2 test did — MSW's `onUnhandledRequest: "error"` caught it.
  Added with a fixture.
- **Waiting budgets raised, not assertions weakened.** The cross-phase walkthroughs click through
  a dozen screens on the real route tree, and every screen sits behind `GET /auth/me`, so nothing
  renders until a real round-trip resolves. Under a fully loaded parallel run all of that flaked
  while passing comfortably in isolation — scheduling, not logic. Three settings came out of it:
  `testTimeout` 5s → 30s, `asyncUtilTimeout` 1s → 10s (the polling budget for `findBy*`/`waitFor`,
  which costs nothing on the passing path because the helper resolves the moment the element
  appears). No assertion was relaxed to make the suite green, so a genuinely hung test still
  fails.
  `maxWorkers: "50%"` was tried and then **reverted**: nine jsdom files on four cores do
  oversubscribe the CPU, but capping the pool took the suite from ~80s to ~165s, slowed the
  walkthroughs enough to flake on the *test* timeout, and did not remove the flakes. The
  generous wait budgets are what fixed it; splitting the mega-test is what removed the
  remaining one.

## Bugs found and fixed while finishing this phase

- **The app crashed on `/scan` — "Unexpected Application Error! Cannot stop, scanner is not
  running or paused."** The worst kind of bug: not in our code, but *reachable* from it.
  `html5-qrcode`'s `stop()` **throws a string synchronously** when its state machine isn't
  already `SCANNING`/`PAUSED`:

  ```js
  if (!this.stateManagerProxy.isScanning()) {
      throw "Cannot stop, scanner is not running or paused.";
  }
  ```

  `start()` opens its transition synchronously but only marks the scanner `SCANNING` once the
  camera has rendered, so **any** stop attempted while a start is in flight lands on
  `NOT_STARTED` — which is exactly when StrictMode's throwaway first mount unmounts (dev), when
  a user leaves before the permission prompt resolves, and when permission is denied. Because
  the throw happens inside an *effect cleanup*, it bypasses every promise `.catch()` we could
  chain and React Router swaps the whole app for its own bare error screen.

  `useQrScanner` now guards on `getState()` before stopping — a scanner that never left
  `NOT_STARTED` has no rendered camera to close — keeps a `try`/`catch` as a belt to that braces,
  and closes the camera from the `start()` continuation when it resolves *after* unmount.
  `src/test/qrScanner.test.tsx` pins all four paths against a mock that reproduces the real
  library's synchronous throw (removing the guard fails three of them).

- **No error boundary anywhere.** React Router only reaches for one if a route element throws;
  with none, a single broken screen cost the visitor the entire app — no header, no nav, no way
  out. `app/AppErrorBoundary.tsx` now wraps each shell's `<Outlet />` so the failure is contained
  to the screen that broke and "Try again" recovers in place, with the root route carrying an
  `errorElement` for a throw from a layout itself. The raw error message appears only under
  `import.meta.env.DEV`.

- **A dead link.** `ItemStaffPage`'s "File transfer / disposal" pointed at
  `/items/:id/request?tag=…`, a route that has never existed — it fell through to the 404 page.
  It now targets `/requests/new?item=<tagId>`, which is what `RequestFormPage` actually reads.
- **The request form's item preselect never worked.** With the link above fixed,
  `RequestFormPage` read `?item=<tagId>` into `useForm`'s `defaultValues`, which are captured on
  the *first* render — before `GET /items` has answered — so `preset` was always `undefined` and
  the select stayed empty. Fixing the dead link alone would have landed users on a form that
  ignored which item they came from. The preset is now applied in an effect once the list
  arrives, guarded so it can't overwrite an item already chosen by hand; the test asserts the
  select's *value*.
- **Duplicate form labels** in `/reports` (see the region note above).
- **`frontend/.env.example`** carried a stray `[TEMPLATE]` line that would have been copied into
  a real `.env`.

## Known limits

- **CSV only.** No PDF (F10.2 was a stretch item), no email delivery beyond the backend's
  `NOTIFY_EMAIL` stub.
- **Duplicate scan rows in the audit export.** The scan endpoint appends a row per accepted call
  and the client guards against re-scanning an item it has already recorded; the *server's*
  completion logic deduplicates. Two devices scanning the same item therefore produce two export
  rows but one classification. This is a backend behaviour, recorded here so it isn't
  rediscovered as a frontend bug.
- **Audit history is paginated, not searchable.** `/audits` lists 20 sessions per page newest
  first (`AUDITS_PAGE_SIZE`), with an admin-only "only mine" filter. There is no date-range or
  scope filter, and nothing deletes or reopens a session: completing is one-way by design.
- **`/map` shows the register's first 100 items.**
- **PNG icon set** for the manifest, and `ResponsiveList` (design doc §8) remain follow-ups.

## Deliberately not done

`/admin/users` still only creates accounts — there is no list or role-change endpoint (G2), and
the page says so. `/admin/categories` is likewise create-only. Both are backend gaps, not
frontend omissions. *(Both were closed afterwards: account list/correct/promote/reset/delete and
category rename/delete exist now — see `frontend-handoff.md` G2.)*

## Exit criteria

- [x] An audit session runs start → scan → complete, and its summary matches the API's counts
- [x] All three reports download valid CSV from the browser with the auth header attached
- [x] Every SRS **P0** screen is reachable
- [x] `/map` is shipped (as building grouping) **and** F5.1 text location remains on `/` and `/items`
- [x] Accessibility pass applied to the Phase 3 screens (named regions, non-colour-only status,
      44px touch targets, skip links inherited from Phase 1)
- [x] `docker compose up` still brings up the whole system with no manual steps beyond `.env`
- [x] Full CI pipeline — lint, type-checking build, and every phase's tests green (`pnpm run lint && pnpm run build && pnpm test`)
- [x] `docs/frontend-handoff.md` written
