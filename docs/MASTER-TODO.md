# MASTER TODO — CNCS Property Management System

**Purpose:** a step-by-step, executable work list for whoever (or whichever agent) picks this project up.
**Read first:** [`KNOWLEDGE-BASE.md`](./KNOWLEDGE-BASE.md) — it holds the rules, the entity model, the state machines, the capability matrix, the wiring map and the conflict rulings. This file holds the **work**.

**How to use this file**
1. Work top to bottom. Each phase states its own exit condition.
2. Tick a box **only** with the stated evidence pasted below it (a command + its real output, or a URL + status code).
3. Never tick "fixed" on the strength of a mocked unit test alone — this codebase's unit tests mock Prisma, so a passing suite does **not** prove a query works against a real database. A real-DB check is required.
4. When a phase reveals a new problem, add it under the phase that owns it (do not create a shadow list).
5. If you change a rule (roles, capabilities, state machines), update `KNOWLEDGE-BASE.md` in the same commit — that file is the contract.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done + evidence · `[!]` blocked (say why)

---

## 0. Current state (measured 20 Oct 2026 — start here, then verify)

| Area | Truth today | Evidence |
|---|---|---|
| Backend tests | **535 pass** | `cd backend && pnpm test` → `Test Files 37 passed (37) / Tests 535 passed` |
| Backend build | clean | `cd backend && pnpm run build` |
| Frontend build | clean | `cd frontend && pnpm run build` |
| Frontend tests | **256 pass** (was 27 failing) | `cd frontend && pnpm test` → `Test Files 38 passed (38)`, `Tests 256 passed (256)` |
| Frontend CI | **now runs the tests** and the API contract check | `.github/workflows/frontend.yaml` — test step + contract step added; the suite it runs is green |
| E2E CI | **new** — builds a real database, seeds it, drives the real flows | `.github/workflows/e2e.yaml` → `scripts/e2e-flows.sh` — 42 checks, green |
| Mobile analyze | **0 errors** (2 style infos) | `cd mobile && flutter analyze` → `2 issues found` (infos only) |
| Mobile CI | **exists now** | `.github/workflows/mobile.yaml` — analyze + test |
| Production | live and healthy | `https://cncs-pms-web.vercel.app` → 200 · `https://cncs-pms-api.vercel.app/api/v1/health` → 200 `{"status":"ok"}` |
| Production bugs | **4 endpoints 500 in production** — fixed in code, **not yet deployed** | `GET /users/invites`, `POST /expiry/check`, `GET /expiry/status` → 500; `POST /auth/account-requests` → 500 (staff sign-up was completely broken). P2-6 has the deploy order. |
| Migrations | **a fresh database now builds and seeds** | `prisma migrate deploy` → `All migrations have been successfully applied`; `pnpm prisma:seed` completes (Phase 2) |
| Seed | **completes on a from-scratch database**, with data for every individual | idempotent (a second run changes nothing); every staff member holds 5–8 items and has 5–7 requests, every head 6 and 4; all nine request states, seven item statuses, both audit sessions, 45 notifications |
| End-to-end flows | **42 checks pass** against a real database | `./scripts/e2e-flows.sh` → `passed: 42 failed: 0` — and it found the approvals-queue bug on its first run |
| Production database | **migrated, seeded and verified** (20 Oct) | the three new migrations applied to the live Neon database after a verified backup; the four 500s are gone; the sign-up → head's queue → approval → sign-in flow works live |
| Live walkthrough | **41 checks, all green** against the deployed app | `./scripts/live-walkthrough.sh` → `passed: 41 failed: 0` |
| Capability sync | backend/web/mobile **still out of sync** | web missing `SYSTEM_CONFIG`, `DISPOSAL_REVERSE`, DEPT_HEAD `ITEM_READ_ALL`; mobile missing the latter two (KB §3.1.1) — Backlog F09 |
| API contract | **two real breaks found by the new check** | `fetchInvitableUnits` read `response.units` from an endpoint that answers with a bare array → **the whole `/admin/users` screen failed in production**; the mobile client called `DELETE /items/:id`, a route the server has never had. Both fixed. `scripts/check-api-contract.mjs` now runs in CI. |

**Fixed in this round (uncommitted at the time of writing — see Phase 1/2):** staff sign-up 500, invite list/resend 500, evidence-pack 500, expiry/escalation 500 (no `updatedAt` column existed), LOAN intake, `loans/overdue` capability gate, migration history repair (4 tables + 2 migrations), seed repairs (3 causes), Frontend CI test step.

---

## 1. Phase 1 — Backend runtime correctness (P0)

*Exit condition: every endpoint in KB §6.1 answers correctly against a **real database**.*

- [x] **P1-1 `POST /auth/account-requests` returns 500 — staff cannot sign up.**
  *Cause:* the route wrote `User.department`, a column the schema dropped; and it never set `orgUnitId`, so the request could never reach a head's queue.
  *Fix:* resolve the unit (`departmentId` **or** a unit name) against `OrgUnit`, require `isActive` + `acceptsSelfReg`, write `orgUnitId`, create the `AccountRequest` queue row in the same transaction, allow-list the institution's email domain, and refuse a duplicate `staffId`.
  *Evidence:* `POST /auth/account-requests` → **201** with `accountStatus: PENDING_APPROVAL`; a gmail address → **400**; an unknown department → **400**. (Production before the fix: **500**.)
  *Also update:* `backend/src/routes/auth.test.ts` — 4 new cases (unknown unit, wrong domain, queue row written, `department` column never written).

- [x] **P1-2 `GET /users/invites` and `POST /users/invites/:id/resend` return 500.**
  *Cause:* both selected `User.expiresAt`, a column that has never existed. The expiry lives on `EmailToken`.
  *Fix:* list outstanding `EmailToken(type=INVITE, usedAt=null)` rows joined to their user and `AccountRequest`; resend deletes the old token, creates a new one, and writes an `ACCOUNT_INVITE_RESENT` log row.
  *Evidence:* both endpoints answer **200** against the local database.

- [x] **P1-3 `GET /reports/audit-evidence-pack` returns 500.**
  *Cause:* selected `sessionNumber` / `type` / `scope` / `itemCount` on `AuditSession`; the real columns are `reportNumber` / `sessionType` / `scopeType` / `scopeValue`, and the tally lives in `results`.
  *Evidence:* CSV + PDF both download for a Property Officer.

- [x] **P1-4 The whole expiry/escalation surface returns 500.**
  *Cause:* three services filtered on `Item.updatedAt` / `Request.updatedAt` — **no model had an `updatedAt` column at all**.
  *Fix:* added `updatedAt DateTime @updatedAt` to `Item` and `Request` (+ migration, backfilled from `registeredAt`/`createdAt` so stale rows do not look fresh), and deleted the dead duplicate `services/expiryEscalation.ts` (it was imported nowhere and duplicated `services/expiry.ts` with hardcoded windows).
  *Evidence:* `POST /expiry/check` and `GET /expiry/status` answer **200** with a real database.

- [x] **P1-5 A LOAN request could never be created.**
  *Cause:* `REQUEST_TYPES = ["TRANSFER","DISPOSAL"]` while approve / return-initiate / return-confirm / return-dispute / overdue all handled loans.
  *Fix:* `LOAN` added, with `loanDueDate` required and in the future, transfer fields refused, and the date persisted on the request.
  *Evidence:* `POST /requests {type:"LOAN", loanDueDate:...}` → **201**; without a due date → **400**.

- [x] **P1-6 `GET /loans/overdue` had no capability check.**
  *Cause:* the comment said "Property Officer only"; the chain only required being signed in — a staff member, an auditor and even the system admin could read the college's overdue-loan count.
  *Fix:* `requireCapability("LOAN_APPROVE")`.
  *Evidence:* a SYSTEM_ADMIN token → **403**.

- [ ] **P1-7 Sweep for the rest of the "comment says X, code does Y" class.**
  *Do:* read every route file and compare the comment's promise with the middleware chain. Search for `requireCapability` coverage on every route that returns asset data.
  *Also grep for:* `optionalAuthenticate` (must not exist), bare `fetch(` in the frontend, `prisma.user.delete` (hard delete), `prisma.item.delete`.
  *Evidence:* a list in this file under Phase 1, with each item fixed or justified.

- [ ] **P1-8 `DELETE /users/:id` hard-deletes.**
  *Cause:* everything else in the app is soft (`VOIDED` items, `DEACTIVATED` accounts) but this route removes the row.
  *Fix:* make it a deactivation (status change + `tokenVersion` bump + items → `REVERTED_UNVERIFIED` + custody `HOLDER_DEACTIVATED` event + `AdminActionLog` row). Never remove an account that has a trail.
  *Evidence:* a deactivated account's old token → **401**; the row still exists with `accountStatus: DEACTIVATED`.

---

## 2. Phase 2 — Database & migrations (reproducible from zero)

*Exit condition: a brand-new empty database can be built and seeded with two commands, on any machine, by anyone.*

- [x] **P2-1 The migration history could not build a database.**
  *Cause:* `OrgUnit`, `AccountRequest`, `EmailToken`, `AdminActionLog` and `Building` existed in the schema and in the live database but **in no migration** — they came from `prisma db push`. The history also still created the old `Department` table. So `migrate deploy` died at `20261014000000_account_invite_fields` with `relation "AccountRequest" does not exist`, and the live database was stuck behind a FAILED row (P3009).
  *Fix:* new migration `20261013000000_materialize_account_tables` creates all five tables idempotently (`IF NOT EXISTS`), copies the legacy `Department` rows into `OrgUnit`, adds and backfills `User.orgUnitId` / `Item.orgUnitId`, and leaves the legacy objects in place (destructive drops belong in a later contract migration).
  *Evidence:* `prisma migrate deploy` on an empty database → `All migrations have been successfully applied`.

- [x] **P2-2 The invite-columns migration could never complete anywhere.**
  *Fix:* made idempotent (`ADD COLUMN IF NOT EXISTS`, guarded constraint/index) so it works on a fresh database **and** on the live one where the columns already exist.
  *Evidence:* applied cleanly on a fresh database.

- [x] **P2-3 The schema and the database disagreed about enums, columns and defaults.**
  *Cause:* `RequestStatus` was missing 5 values the workflows write; `CustodyEventType` was missing 3; `Request` was missing 9 stage/loan/withdrawal columns; `User` was missing `staffId` / `escalatedAt` / `escalatedById`; `Item` was missing `buildingId`.
  *Fix:* migration `20261019000000_align_schema_with_datamodel` adds all of it, adds the missing indexes and foreign keys, and relaxes the `NOT NULL` on the legacy `Item.building` / `Item.department` / `User.department` columns (the schema no longer declares them, and **every item insert failed** on them).
  *Evidence:* `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` now reports only the intentionally-kept legacy objects.

- [x] **P2-4 `updatedAt` did not exist.**
  *Fix:* migration `20261020000000_item_request_updated_at` adds it to `Item` and `Request`, backfilled from `registeredAt` / `createdAt`, and drops the database default so Prisma owns the value.
  *Evidence:* `prisma generate` + the expiry endpoints answer 200.

- [x] **P2-5 The seed failed three separate ways on a from-scratch database.**
  *Causes and fixes:*
  1. `Item.ownerId` is a **User** foreign key, but the seed wrote a department's id into it → foreign-key violation. Fixed: department-held items point the legacy column at the Property Officer; the real custody is the holder pair.
  2. The seed wrote the legacy `building` text field, which the schema no longer declares → Prisma rejected the unknown argument. Fixed: `buildingId`.
  3. The schema default for `accountStatus` is `PENDING_EMAIL_VERIFICATION`, so demo accounts created without an explicit status could never sign in (and re-seeding did not converge, because the upsert's `update` branch was empty). Fixed: every demo account is explicitly `ACTIVE` on **both** branches of the upsert.
  *Evidence:* `pnpm prisma:seed` completes on a from-scratch database and prints the fixture summary.

- [ ] **P2-6 Apply the repaired history to the live database.**
  *Order (do not improvise):*
  1. Take a Neon branch backup first: `neonctl branches create` or the console's "create branch" — the production database must be restorable.
  2. `prisma migrate resolve --rolled-back 20261012000000_phase_a_expand` (it has a FAILED row **and** an applied row — resolve it, do not delete rows).
  3. `prisma migrate deploy` with `DIRECT_URL` (unpooled) — the three new migrations are idempotent, so they are safe on a live database that already has the tables.
  4. `pnpm prisma generate`.
  5. `pnpm prisma:seed` (idempotent) — prints demo credentials.
  6. Re-run the Phase 1 probes against production; paste the results here.
  *Evidence:* the four production 500s are gone.

- [ ] **P2-9 Drop the `updatedAt` database default.**
  *Why it is still there:* the old deployed Prisma client does not know the column exists, so it sends no value for it. With the default dropped, the moment the migration runs, every insert of an item or a request on the live database would fail. The default is the bridge that makes the rollout safe; the new client writes the value itself.
  *Do it when:* no deployed client writes without the column (i.e. after the new build is live and the old one is gone), in a separate contract migration. `prisma migrate dev` will keep proposing the drop — the deviation is deliberate until then.

- [ ] **P2-7 Decide the fate of the legacy objects.**
  *Still in the live database and now inert:* the `Department` table, `Item.department`, `Item.building`, `User.departmentId`, `Item.ownerId`.
  *Decide:* drop them in a reviewed contract migration (the `ownerId` column still has live readers — KB §3.1.2), or keep them and document why. Write the decision here.
  *Evidence:* a note in this file + the matching KB update.

- [ ] **P2-8 A real test database in CI.**
  *Today the backend suite mocks Prisma, so a query against a missing column is invisible to CI — that is how four 500s shipped. Add a Postgres service to `backend.yaml`, run `migrate deploy` + `seed` there, and add at least one **integration** test that exercises the real database (a "smoke" suite: sign in → file a request → approve → claim).
  *Evidence:* the workflow runs the real-database suite and it is green.

---

## 3. Phase 3 — Seed data: realistic, per-individual, per-role

*Goal: every person in the college can sign in and immediately exercise **every** capability their role has — and every individual has enough data to test the paths around them. A CS instructor should have ≥5 of each data type they can act on.*

*Exit condition: for each account below, sign in with it and complete the role walkthrough in Phase 9 using only that account's data.*

- [x] **P3-1 Fix the demo-account list so it matches reality.**
  *Found:* `SEED_USERS.staff` (`staff@cncs.aau.edu.et`) and `SEED_USERS.deptHead` (`dept.head@cncs.aau.edu.et`) are declared in `seed.ts` but **never created** — the KB's credential list advertised accounts that do not exist. Removed from the list (KB §20 and the credentials file now list only real accounts).
  *Evidence:* the KB §20 table and the seed agree, row for row.

- [x] **P3-2 Every individual gets a full, realistic set of data.** *Minimum per person: 5 items, 5 requests in a mix of states, and the notifications/approvals that follow from them.*

  | Account | Items they hold | Requests they filed | Requests waiting on them | Notifications |
  |---|---|---|---|---|
  | `admin@cncs.aau.edu.et` (SYSTEM_ADMIN) | 0 (holds nothing by design) | 0 | every escalated account request | all account-level events |
  | `officer@cncs.aau.edu.et` (PROPERTY_OFFICER) | 5+ in the college pool | 2+ | every transfer/disposal/loan | request + audit events |
  | `head.cs@cncs.aau.edu.et` (DEPT_HEAD) | 5+ personally held | 3+ | own-unit staff requests + stage-1/2 transfers of CS | own-department events |
  | `head.bio@…`, `head.chem@…` | 5+ each | 3+ each | own-unit staff requests + transfers | — |
  | `staff.cs1@…` | 5+ | 5+ (mixed states) | claims filed against them | their own |
  | `staff.cs2@…`, `staff.bio1/2@…`, `staff.chem1@…` | 5+ each | 5+ each | claims against them | — |
  | `auditor@cncs.aau.edu.et` (AUDITOR) | 0 | 0 | active audit sessions | findings + audit events |

- [x] **P3-3 Requests must exist in every state, not just PENDING.**
  *Needed so every branch of the workflow is reachable from the UI:* `PENDING`, `PENDING_STAGE1`, `PENDING_STAGE2`, `APPROVED`, `REJECTED` (with a reason), `WAITLISTED`, `WITHDRAWN`, `INVALIDATED`, `RETURN_PENDING_CONFIRMATION`, plus a **LOAN** (new in this round).
  *Evidence:* `GET /requests` per role shows all nine states; Phase 9 walks each one.

- [x] **P3-4 Items must exist in every status, and each status must have a realistic reason.**
  `ACTIVE` (most), `PENDING_CLAIM` (one waiting for a claim — with `claimDueAt` in the near future), `LOANED` (with a due date), `REVERTED_UNVERIFIED` (waiting for a new head to verify), `DISPOSED` (with a reason + `disposedAt`), `LOST` (an audit casualty), `VOIDED` (a data correction).
  *Also:* 2–3 accessory bundles (parent + accessories) so the cascade is demonstrable, and at least one item in each of the 3 departments + the college pool.

- [x] **P3-5 Account-approval data in every state.**
  Pending staff requests for CS, Biology **and Physics** (headless → SYSTEM_ADMIN's queue), one escalated request, one rejected request (with the reason visible in the UI), and one outstanding **privileged invite** (so the invite list, resend and accept flows have something to act on).
  *Evidence:* each of the four queues in KB §3.2 is non-empty when you sign in as the right person.

- [x] **P3-6 Audit data.**
  One completed session (with a frozen result set: FOUND / MISSING / LOCATION_MISMATCH rows, a `reportNumber`, a `completedAt`), one **active** session mid-way (so the "Active Audit" widget and the scan screen have something to resume), and one session whose grace window is about to expire (so the escalation path is observable).
  *Evidence:* the auditor dashboard shows progress and findings on first sign-in.

- [x] **P3-7 Notifications.**
  At least 5 per decision-maker, each a different kind, so the notification list is not a wall of one type: request submitted, request approved, request rejected, escalated to you, claim filed against you, head changed.
  *Evidence:* sign in as the CS head → the Notifications page shows ≥5 distinct kinds.

- [x] **P3-8 The seed must be idempotent and must converge.**
  *Today:* re-running the seed left the admin in `PENDING_EMAIL_VERIFICATION` because the upsert's `update` branch was empty. Every demo row must reach the same state on every run. Add a test that seeds twice and compares counts.
  *Evidence:* `pnpm prisma:seed` twice → identical row counts; `pnpm test` has a "seed is idempotent" case.

---

## 4. Phase 4 — Contract tests: does the frontend really call what it thinks?

*The question this phase answers: **"the backend assumes the frontend calls endpoint X with body Y and reads field Z — is that true?"** Today it is assumed, not checked.*

- [x] **P4-1 A static contract check (fast, runs in CI).**
  *Do:* extract every path from `frontend/src/api/*.ts` and `mobile/lib/data/api/*.dart` and assert each one resolves to a real route in `backend/src/routes/*` (mounted at `/api/v1/...`).
  *How:* a script `scripts/check-api-contract.ts` that reads the backend router files, collects `METHOD /path` pairs, and fails on any frontend path with no match. Ignore the `apiClient` base prefix and treat `:param` as a wildcard.
  *Why:* a renamed or deleted backend route breaks the frontend silently — the UI shows an empty list, not an error.
  *Evidence:* the script runs in `frontend.yaml` and is green; when you delete a route, it fails.

- [~] **P4-2 A request/response shape contract.** — the static path check is done (P4-1). The shape half started with a real find: `GET /departments/invitable` answers with a bare array and the client read `response.units` — the whole `/admin/users` screen failed in production, and the test mock had answered with the shape the *client* expected, which is why no test caught it. Still to do: a fixture per endpoint captured from the running server, rendered by the component, asserting it does not fall into an error branch.
  *Do:* for each endpoint the frontend calls, assert the **response fields the frontend reads** exist in the backend response. The two real examples found so far: `GET /audits/active` returns `{active, session, progress}` (the frontend maps it to a flat tile) and `GET /items/recent` returns `registeredAt` (not `createdAt`).
  *How:* a shared fixture per endpoint + a test per client that renders the component with the **real backend response body** (captured from the running server) and asserts it does not fall into an error/empty branch.
  *Evidence:* a fixture directory `frontend/src/test/fixtures/api-responses/*.json` generated from the live API.

- [x] **P4-3 A live end-to-end flow test against a real database.** — `scripts/e2e-flows.sh` (42 checks) builds a database from the migrations, seeds it, starts the real server and drives the real flows over HTTP. It runs in CI (`e2e.yaml`) with its own throwaway Postgres, so it can never touch a developer's data. **It found a serious bug on its first run**: the approvals queue filtered on `reviewNote NOT LIKE '%[ESCALATED]%'`, which is NULL for a row with no note — so a Department Head never saw a newly submitted account request, and only a SYSTEM_ADMIN could approve one. D1 was silently not happening.
  *Do:* run the built backend against a real Postgres and drive the flows over HTTP — exactly the way the browser does:
  1. staff signs up → head sees it in the queue → head approves → staff signs in;
  2. staff files a transfer → stage 1 → stage 2 → recipient claims → the holder changed;
  3. a loan is filed, claimed, returned (initiate → confirm) and one is disputed;
  4. a disposal is approved → the item is `DISPOSED` → the reversal restores it;
  5. an audit is opened, items are scanned, the session is completed, the report downloads.
  *Evidence:* a script `scripts/e2e-flows.sh` (or vitest) that prints each step's HTTP status; it must run against a fresh database every time.

- [~] **P4-4 Assert the security assumptions, not just the happy path.** — the e2e script now covers: anonymous → 401, SYSTEM_ADMIN → zero asset rows, a wrong-capability call → 403 (`/loans/overdue` for an admin), the head's queue scoping, and the two refusals (unknown unit, address outside the institution). Still to add: a per-endpoint table of the four observed status codes (anonymous / wrong role / wrong scope / correct).
  For every endpoint: anonymous → 401; a wrong-role token → 403 or **404** (out of scope, per KB ground rule 3); a SYSTEM_ADMIN token → **zero asset rows**; a staff token → no other staff's data.
  *Evidence:* a table in this file, one row per endpoint, with the four observed status codes.

---

## 5. Phase 5 — Frontend: login + every role's pages (UI/UX)

*Exit condition: each role's journey is usable, honest, and free of dead ends. No page shows a fake empty state; no button does nothing.*

- [~] **P5-1 Login page.** — the states are covered: the server's own refusal sentences are shown verbatim, `next` survives every path, the forced password change is honoured, and a **rejected** applicant is now told **why** (the decision note is their own to read, rather than "phone the property office"). The help text now says a **department head** approves a staff account (it said "system administrator", which was wrong since D1) and offers a link for people who were **invited**.
  Realistic states: wrong password, unknown email, pending approval, rejected (with the reason), deactivated, forced password change, expired session. The `next` parameter must survive all of them. Loading must disable the button, not double-submit.
  *Evidence:* a test per state + a manual click-through.

- [ ] **P5-2 The dashboard per role.**
  * **STAFF** — what do I hold, what is waiting on me, what can I request, one clear "request an item" action.
  * **DEPARTMENT_HEAD** — my department's holdings, the staff I supervise, the requests awaiting my decision, the items awaiting my verification after a handover.
  * **PROPERTY_OFFICER** — the college's state: pending decisions, overdue loans, recently registered, buildings.
  * **AUDITOR** — the active session, open findings, history.
  * **SYSTEM_ADMIN** — accounts, pending approvals, recent account events. **Zero asset data.**
  *Rule:* every widget must show a real error state, never a confident zero (KB §2 rule 7).
  *Evidence:* screenshot or test per widget per role.

- [ ] **P5-3 Navigation.**
  One source of truth (`navConfig.ts`) that matches the router, is role-filtered, and keeps the badge counts honest. `navRoutes.test.tsx` must pass for all 5 roles. Mobile bottom-bar overflow must carry the same items and badges as the sidebar.
  *Evidence:* the nav test green + a manual pass on both layouts.

- [x] **P5-4 Requests: file, decide, withdraw, return.** — done 20 Oct: the form accepts **LOAN** (with a required future due date, validated the way the server validates it), the approval is **stage-aware** (stage 1 says "releasing — this does not move the item", stage 2 says "receiving — this moves the item"), and the **loan-return handshake** has a screen: the borrower says "I am handing it back", the lender confirms it came back (with the condition recorded) or reports that it has not. Four new tests cover it. The **claim-with-correction / verify-confirm / verify-flag / reverse-disposal** controls are now on the item page as well (P5.4b, below).
  The request form must support **LOAN** (with the due date) — the backend accepts it now. The decision surface must distinguish **stage 1** from **stage 2** (today one Approve button serves both). Add the **loan-return** handshake UI (initiate / confirm / dispute) — the endpoints exist and have no UI. Add the **claim-with-correction**, **verify-confirm/verify-flag** and **reverse-disposal** controls — all three exist server-side with no UI.
  *Evidence:* one test per action; the flow walkthrough in Phase 9 uses only the UI.

- [x] **P5-4b The custody actions, on the item page.** — `ItemCustodyActions` gives the six endpoints that had **no screen at all** one: a holder can claim an item, **accept it with a corrected condition** (the register said one thing, the item is another — keeping the difference on the record is what makes it auditable), or **refuse it** with a reason; a head can **verify** an item that changed hands without a handover check, or **flag** it for review; a Property Officer can **reverse a disposal**, with a reason, and the item returns to the pool to be registered again. Five new tests.

- [ ] **P5-5 Fix the known dead/broken UI.**
  * `AuditListPage` "Abandon audit" → **fixed 20 Oct**: there is now a real `POST /audits/:id/abandon` (with a required reason), a distinct "Abandoned" state that is **not** "In progress" and **not** "Completed" — it produced no report — and no report/CSV link on an abandoned session. Migration `20261021000000_audit_session_abandon` adds `abandonedAt`/`abandonReason`.
  * `AdminUsersPage` password-reset modal → unreachable; **remove it** (KB C10: no admin ever sets a password) and replace with "send a reset link".
  * `DepartmentDetailPage` → hardcoded fake categories; the "Department Head" card shows the department name; inline "Access Denied" instead of the shared 404.
  * `CatalogPage` → orphan route with links that ignore the clicked item; `DepartmentCatalogPage` → unrouted dead page.
  * `SystemStatusPage` → no retry, bare error, uptime/lastDeploy never rendered; and it is reachable by a DEPARTMENT_HEAD whose data endpoint is SYSTEM_ADMIN-only (fix the route **or** the page).
  * `RequestDetailPage` → the custody line shows raw truncated hex; `SearchXIfNeeded()` is a dead stub.
  * `MapPage` → the caption still says "Showing up to 100 items".
  * `AppLayout` → stray mis-indented JSX.
  *Evidence:* each item ticked with the fix and a test.

- [ ] **P5-6 Empty, loading and error states.**
  Every list: skeleton while loading, a written empty state (not "null"), an offline state, and a retry. Every mutation: a toast, a disabled button while in flight, and the cache invalidated.
  *Evidence:* a checklist per screen; the offline state is reachable by toggling the network in the browser.

- [ ] **P5-7 Accessibility and the AAU identity.**
  Keyboard reachability, visible focus, `aria-*` on disclosures and badges, contrast on the AAU blue/red palette, the Amharic wordmark rendering (the font is loaded; the strings are not — Phase 8).

---

## 6. Phase 6 — Responsive: mobile view and desktop view

*Exit condition: both layouts are usable for every role, with no horizontal scroll and no hidden action.*

- [ ] **P6-1 Verify the breakpoints by hand** at 375, 768, 1024 and 1440 px: dashboard, items browse, item detail, request list, request detail, approvals, audit scan, reports, notifications, login.
- [ ] **P6-2 The phone layout is not a squeezed desktop layout.** Bottom tab bar (≤4 primary + "More"), safe-area insets, the AAU drawer, sticky headers, and the tables that must become cards.
- [ ] **P6-3 The QR scanner must work on a phone** (camera permission prompt, a clear failure path when denied, manual tag entry as the fallback).
- [ ] **P6-4 The desktop layout must not waste the width** (the register, the approval queue and the audit report are all wide).
- [ ] **P6-5 Print** — the QR sticker path must still print correctly (`[data-print-tag]`).
- *Evidence:* a table of screens × viewports with pass/fail, plus screenshots.

---

## 7. Phase 7 — Mobile app parity

- [x] **P7-1 Fix the 2 `flutter analyze` errors** (`Role.accountAdmin` in `lib/widgets/status_badges.dart:160,169` — leftovers from the 6-role era). `flutter analyze` must report **0 errors**.
- [ ] **P7-2 Add a mobile CI workflow** (`.github/workflows/mobile.yaml`): `flutter pub get` → `flutter analyze` → `flutter test`. No CI = the stale enum survived for a week.
- [ ] **P7-3 Align the capability matrix** with the backend: mobile is missing `DISPOSAL_REVERSE` and DEPARTMENT_HEAD's `ITEM_READ_ALL` (KB §3.1.1).
- [ ] **P7-4 Fill the feature gaps:** invite acceptance (the invite link points at the web origin, so an invited person must leave the app), request withdrawal, the loan-return handshake, `GET /items/recent` and `GET /items/held-by-me` (the mobile dashboard fetches whole pages to count three things).
- [ ] **P7-5 Fix the hardcoded share link** (`item_detail_view.dart:281` points at a domain that is not in production).
- [ ] **P7-6 Real-device check** — the APK must install, sign in, scan a tag, file a request and read notifications on a physical phone (no Android device was available earlier; this is the outstanding item).
- *Evidence:* `flutter analyze` clean, `flutter test` green, CI green, and a written device result.

---

## 8. Phase 8 — CI, deployment, and staying deployed

- [x] **P8-1 The frontend workflow now runs the tests** — and the suite it runs is **green (243/243)**. A CI that cannot fail is worse than no CI: it reported green while the suite was broken.
- [ ] **P8-2 Backend CI**: keep lint + build + tests; add the real-database integration suite (P2-8).
- [x] **P8-3 Mobile CI**: added (`.github/workflows/mobile.yaml`: analyze + test).
- [ ] **P8-4 Branch protection on `main`**: require the PR + the three checks. The upstream repo already has it; the fork must match.
- [ ] **P8-5 Deployment is proven behaviourally, not by the "Ready" badge.**
  *After every deploy, prove which revision is live:* hit a route that only exists on the new revision (e.g. `GET /users/invites` before/after the fix) and paste the status codes. A "Ready" badge proves the build finished, not that it is the revision you meant.
- [ ] **P8-6 The deploy checklist** (KB §22): migrations → `prisma generate` → seed → deploy API → verify → deploy web → verify.
- [ ] **P8-7 Environment variables** are set on the target project, with `PUBLIC_BASE_URL` treated as frozen (it is baked into every printed QR sticker — changing it after printing dead-ends every sticker and CI cannot detect it).
- *Evidence:* the deploy history shows the three workflows green, and a behavioural proof of the revision.

---

## 9. Phase 9 — The role walkthroughs (the real test)

*This is the phase that decides whether the app is "production ready". Each walkthrough uses **only the UI**, in a browser, on a phone and on a desktop, with the seeded data.*

- [ ] **P9-1 STAFF** — sign up → see the request → file a transfer → file a disposal → claim an item assigned to them → refuse a claim (with a reason) → change their password → read and dismiss a notification → see only their own items.
- [ ] **P9-2 DEPARTMENT_HEAD** — approve a staff request from their own unit → approve a stage-1 transfer → approve a stage-2 transfer → verify a handover item (confirm + flag) → see their department's roster and items → try to approve a request from **another** unit (must be refused).
- [ ] **P9-3 PROPERTY_OFFICER** — register an item → print its tag → approve a transfer / disposal / loan → reverse a disposal → run an audit end to end → download the inventory report (CSV + PDF) → manage a category → manage a building.
- [ ] **P9-4 AUDITOR** — start an audit → scan items → complete it → read the report → download the evidence pack → confirm the read-only state of a completed session → attempt an action they must not do (must be refused).
- [ ] **P9-5 SYSTEM_ADMIN** — invite a privileged account (with the authorization fields) → resend the invite → accept it → approve a staff request → deactivate an account → see the account event log → **see no asset data anywhere**.
- [~] **P9-6 The 20-row live-verification table** (KB §17) — all 20 rows, with the real responses pasted. `scripts/live-walkthrough.sh` now walks the deployed app role by role (41 checks, all green) and covers the account-approval flow, the refusals, and the rule that a SYSTEM_ADMIN sees zero items and zero requests. The remaining rows are the role-specific negatives (a head approving another unit's request, an auditor acting, a self-approval).
- [~] **P9-7 Negative paths** — proven on the deployed app: out-of-scope reads are 404/403, a staff member calling the approvals endpoint is refused, an anonymous caller gets 401, a request from outside the institution is refused, a request naming a unit the college does not have is refused, and a SYSTEM_ADMIN sees zero items and zero requests. Still to prove: a self-approval refused, a deactivated account's token dying, and a used invite link erroring cleanly.
- *Evidence:* a walkthrough table: step → who → screen → result. Anything not passed stays open here.

---

## 10. Phase 10 — Definition of done (release checklist)

- [ ] Every checkbox above is ticked, or is explicitly waived with a reason and a name.
- [ ] The backend, web and mobile capability matrices are identical (automated test).
- [ ] The 20-row live table and the 5 role walkthroughs pass on the deployed revision.
- [ ] A fresh database can be built and seeded with two commands by someone who has never seen the project.
- [ ] CI runs tests (not just builds) on all three packages and is green.
- [ ] The KB's backlog (§14) is updated: done items ticked, new items added.
- [ ] `docs/README.md` still points at the KB as the single authority.
- [ ] **No secret is committed to the repository** (see the credentials file — it is git-ignored on purpose).

---

## Appendix A — commands

```bash
# Backend
cd backend && pnpm install && pnpm test && pnpm lint && pnpm run build
pnpm exec prisma migrate deploy        # needs DIRECT_URL (unpooled)
pnpm prisma:seed

# Frontend
cd frontend && pnpm install && pnpm test && pnpm lint && pnpm run build

# Mobile
cd mobile && flutter pub get && flutter analyze && flutter test

# Local database (Postgres in Docker — no cloud credentials needed)
docker run -d --name cncs-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_USER=cncs \
  -e POSTGRES_DB=cncs_test -p 55432:5432 postgres:16-alpine
export DATABASE_URL="postgresql://cncs:test@localhost:55432/cncs_test"
export DIRECT_URL="$DATABASE_URL"
```

## Appendix B — access & credentials

**The credentials live in [`LOCAL-CREDENTIALS.md`](./LOCAL-CREDENTIALS.md), which is deliberately git-ignored** — that file holds a live database password, a Vercel token and a git identity. It is on this machine for the agent to use, and it is **not** published to GitHub.

What is in it: the git identity to use for commits, the personal fork (the deploy source), the upstream repo (pull requests only — `main` is protected), the Vercel projects and their production URLs, the Vercel access token, and the Neon connection string.

**Rules for the credentials**
- Use them; do not ask for them again.
- Never write them into a file that is committed (no `.env` that is tracked, no workflow file, no doc).
- Never print them into a commit message or a PR description.
- Rotate the Vercel token and the Neon password if they are ever pasted in public (a Telegram group counts).

## Appendix C — the "evidence" rule

A ticked box means: **the command was run, and its real output is pasted below it.** Not "it should work". Not "the code looks right". This project shipped four production 500s and a frontend suite with 27 failures behind a green CI — every one of them was invisible because nobody ran the thing and looked.
