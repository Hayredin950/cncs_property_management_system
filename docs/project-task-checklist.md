# CNCS PMS — Project Task Checklist (single source of truth)

**Audited:** 14 Oct 2026, cold, directly against the code, the git history and the live
deployments. **Every `[x]` below was verified in this audit session** — by reading the file at
the cited line, by running the command, or by an HTTP call against the live API. Nothing is
marked `[x]` on the strength of a commit message, a prior chat summary or a previous agent's
report.

**Audit basis**

| What | Value |
|---|---|
| Branch audited | `phase-a-b-complete` @ `24fb728` |
| Working tree | **dirty** — 8 modified files, 1 untracked (`vercel.json`) |
| Ahead of `origin/main` | 38 commits |
| Unpushed to `origin/phase-a-b-complete` | 4 commits (`24fb728`, `ea4f897`, `3b4f5f2`, `3a4f010`) |
| Open PRs anywhere | **none** — #18 ("Complete Phase A and Phase B implementation") is **CLOSED**, not merged |
| Backend | lint 0 errors / 20 warnings · `tsc` clean · **460 tests pass (32 files)** |
| Web | lint **1 error** · `tsc` **15 errors** · **10 tests fail / 182 pass** |
| Mobile | `flutter analyze` 2 info · **54 tests pass** · **no CI workflow exists for mobile** |
| CI on this branch | **9 consecutive failures** (both workflows); last green run is `main` @ 2026-10-10 (PR #17) |
| Production web | `cncs-pms-web` Ready (deployed 14 Oct 09:28 EAT) |
| Production API | `cncs-pms-api` Ready (deployed 14 Oct 09:28 EAT) — **runs the old `personal/main` revision, not this branch** |

Legend: `[x]` done and verified this session · `[~]` partial, note says what is missing ·
`[ ]` not started or not verified.

---

## 0. Blocking state (fix before any new feature work)

- [ ] **CI is red on the only branch with the rework.** 9 consecutive failures
      (`gh run list --repo yanetgeleta/...`): Backend + Frontend CI, all `phase-a-b-complete`,
      39s–53s each. Not an environment problem — see the two real failures below.
- [ ] **`frontend` does not typecheck at HEAD** — `tsc -b` emits 15 errors, verified in an
      isolated worktree of `24fb728`. `src/features/dashboard/widgets/AuditHistoryQuickList.tsx:7`
      imports `useAuditHistoryList`, which does not exist in `src/hooks/useAudits.ts`;
      `AuditListPage.tsx:13`, `AuditNewPage.tsx:14`, `AuditScanPage.tsx:11` import
      `useAuditsList`, `useCreateAuditSession`, `useAuditSession`, `useCompleteAuditSession`,
      `useScanAuditItem` — all deleted in `bd1cc65`. `DepartmentRoster.tsx:7` and
      `useSystem.ts:17,39` likewise.
- [ ] **`frontend` fails lint at HEAD** — `src/features/auth/RequestAccountPage.tsx:49`: a
      `useEffect` is called after an early `return` (`react-hooks/rules-of-hooks`, error).
      This file is committed and unmodified, so it fails independently of the working-tree WIP.
- [ ] **The dirty working tree is half-finished and also broken** — the same `tsc` run in the
      working tree reports 5 errors (`AuditScanPage.tsx:70,116,144`, `AuditListPage.tsx:146`,
      `useAudits.ts:190`). The restored hooks were written with signatures the committed call
      sites do not match (`useScanAuditItem(id)` vs `mutateAsync(item.id)`). Either finish this
      refactor or revert it — do not push it as-is.
- [ ] **Production is not running the rework.** The live API 404s on `POST /items/:id/claim`,
      `/items/:id/void`, `/audits/active`, `/loans/overdue`, `/departments/:id/roster`, and
      `/admin/system/status`, and returns the `personal/main`-shaped `{"data":[…]}` for
      `/items/recent`. Git-side proof: `personal/main` implements `/recent` **before** `/:tagId`
      (line 354 vs 383) and has no `loans.ts` routes — exactly the behaviour observed live.
- [ ] **Latest Vercel deploys errored** while older ones are Ready — see §4.

---

## Phase A — Mandatory

### 1. Role model rework (five roles)
- [x] `enum Role` is the five spec roles, no `ACCOUNT_ADMIN` — `backend/prisma/schema.prisma:39–45`.
- [x] Migration `20261012010000_role_five_role_enum` exists on disk (`backend/prisma/migrations/`).
- [x] One capability matrix on the server — `backend/src/services/permissions.ts:58–66,82–84,119–120`.
- [x] Web mirrors it — `frontend/src/lib/permissions.ts:32–36,43–44,73–74`.
- [~] **Mobile has NOT followed.** `mobile/lib/models/permissions.dart` still spells a
      6-role model (`Role.accountAdmin`, `Capability.accountManage`) and none of the five
      `ACCOUNT_*` capabilities; `mobile/lib/models/enums.dart:21` still parses
      `'ACCOUNT_ADMIN'`. The "add a test comparing the three capability lists" item does not exist.
- [ ] No test compares the three capability lists (backend/web/mobile).

### 2. Scan-visibility split
- [x] Server-side scope function exists (`itemListScope`) and is applied as an `AND` term —
      `backend/src/routes/items.ts:290–305`.
- [x] `SYSTEM_ADMIN` gets zero asset rows on the list endpoint — **verified live** with a fresh
      admin token: `GET /api/v1/items` → `{"data":[],"pagination":{"total":0}}`.
- [~] `STAFF` can still read an item they do not hold **by id/tag**: live `GET /items/:id` as
      `staff@cncs.aau.edu.et` returned **200** for items owned by the System Admin and by two
      other users (tag, name, building, room, condition, photo). Cost/serial/holder are
      stripped, so it is a partial leak, not a full record — but spec 2.2 says staff see
      *own property only*, and the correct answer is 404.
- [~] Same for `DEPARTMENT_HEAD` (200 on an item outside their unit).
- [ ] F2 "out-of-scope tag → 'Not assigned to you, contact Property Office'" is not implemented.

### 3. Holder model + custody log
- [x] `holderType` / `holderId` on `Item` — `backend/prisma/schema.prisma:365–367`; index at `:416`.
- [x] `model CustodyEvent` (append-only) — `backend/prisma/schema.prisma:421`.
- [x] `backend/src/services/holder.ts` is the single writer (`staffHolder`, `collegeHolderFields`,
      `custodyTransition`, `buildCustodyEvent`, `recordCustodyEvent`, `writeCustodyChange` — lines
      60–237) with 14 passing tests in `services/holder.test.ts`.
- [x] Migration `20261012020000_backfill_holder_fields` exists on disk.
- [ ] **Contract step not done:** `ownerId` is still a live column and still returned by the API
      (seen in the live `/items/recent` payload). Roadmap says dropping it is the next step.
- [ ] `CustodyEvent.departmentHeadSnapshot` has no `DEPARTMENT` holder to name yet.

### 4. Account flow / approval queue
- [x] Legacy `User.accountStatus` queue is implemented and **live**: `GET /users/approvals`
      returned 200 with `accountStatus: "PENDING_APPROVAL"` rows for the real admin token;
      `approve`/`reject`/`escalate` handlers exist — `backend/src/routes/users.ts:130,189,290,364`.
- [x] `canDecide` is actually called in approve, reject and escalate — `users.ts:216,314,387`
      (not only in the list query).
- [x] Out-of-scope decisions return 404 with no state change — `users.ts:232,330,403`.
- [x] No-self-approval is enforced server-side — `users.ts:241`.
- [~] The queue is built on `User.accountStatus`, not on `AccountRequest`: nothing in
      `backend/src` reads the `AccountRequest` model (only the generated Prisma client does).
      The two flows coexist; the newer one is dead code.
- [ ] `AdminActionLog` is **never written anywhere**. Grep of `backend/src` finds the model only
      in `src/generated/prisma/**`. Ground rule 4 of the authority doc ("every decision is
      written to the append-only AdminActionLog") is unmet.
- [ ] `confirmedUnitId` honored only from SYSTEM_ADMIN — not implemented.
- [ ] Decision email (status + sign-in link, never a password) — not implemented.
- [ ] Escalation is a `reviewNote` string hack (`"[ESCALATED]"`, `users.ts:151,414`), not
      `escalatedAt`/`escalatedById`; no `APPROVAL_ESCALATION_DAYS` config and no stale-on-read
      or scheduled job exists anywhere in `backend/src`.

### 5. Item lifecycle + claim handshake
- [x] Full state machine in the schema — `PENDING_CLAIM, ACTIVE, REVERTED_UNVERIFIED, LOANED,
      LOST, DISPOSED, VOIDED` — `backend/prisma/schema.prisma:75–83`; claim fields (`claimedAt`,
      `claimDueAt`, `lastVerifiedAt`) present on `Item`.
- [x] Claim endpoints exist in code — `POST /items/:id/claim` (`items.ts:762`) and
      `POST /items/:id/refuse-claim` (`items.ts:881`), with a 409 for a non-pending item and a
      holder/head check (`items.ts:799,832`).
- [~] `VOIDED` exists in the enum and `voidReason`/`voidedAt`/`voidedById` are columns, but
      **there is no route that voids an item** (no `/:id/void` in any router).
- [ ] Claim handshake not verified end-to-end: it is not deployed (live 404) and no test in
      `backend/src` exercises `POST /items/:id/claim`.

### 6. Remove public routes and hard delete
- [~] `GET /items/:id` requires auth — **verified live**: 401 with no token, 401 with a
      tampered token.
- [ ] **`GET /items` is still public.** **Verified live**: with no `Authorization` header and
      again with `Bearer not-a-real-token`, it returns **HTTP 200 with all 9 items**
      (`{"data":[…9…],"pagination":{"total":9}}` — tag IDs, names, buildings, rooms, conditions,
      photo URLs, org units). The route is guarded by `optionalAuthenticate`, so an invalid or
      expired token is silently downgraded to anonymous instead of 401 — which is also the
      explanation for the previously reported "SYSTEM_ADMIN saw 9 items": it was an
      expired/invalid token, not the role check. Both halves are real bugs:
      the endpoint is public, and a bad token does not fail closed.
- [ ] F2 "unauthenticated → login page, identical for any tag" — `/items/:id` 401s, but the
      list endpoint leaks as above.
- [ ] Hard delete of items: no item DELETE route exists, so nothing to remove there; but
      `DELETE /users/:id` (`users.ts` end) is still a hard delete whenever the account has no
      trail. Nothing deactivates an account.

### 7. Optimistic locking + DB uniqueness
- [x] `version` is a column, a request field and a guard on update —
      `backend/src/routes/items.ts:109` (schema field), `:617` (echoed as `currentVersion` on
      conflict), `:725` (`where: { id, status: "ACTIVE", version: existingItem.version }` +
      `version: { increment: 1 }`).
- [x] Lifetime `pin` unique and audit-result uniqueness declared in
      `backend/prisma/migrations/20261012000000_phase_a_expand/`.
- [x] Session invalidation on role change: `tokenVersion: { increment: 1 }` on promote
      (`users.ts` promote handler) and on admin password reset (`users.ts` password handler).

### 8. Concurrency/scope items from §14
- [~] §14.1 server-side permission checks: present as `requireCapability` on the admin/audit/
      report routers, but the `/items` list leak above shows it is not universal.
- [~] §14.5 rate limiting on login: `src/middleware/rateLimit.ts` + 4 tests exist; not verified
      live.
- [ ] §14.6 "public endpoints never return internal fields" — the anonymous list strips cost and
      custodian, but still returns exact location (building/floor/room) and photo.

---

## Phase B — Core workflows

### 9. Transfer with dual approval
- [~] Implemented in code — `backend/src/services/requestWorkflow.ts` (`assertDecidable:78`,
      `buildTransferChanges:134`, `applyDecision:263`) and `POST /requests/:id/approve`
      (`routes/requests.ts:629`); 16 tests in `services/requestWorkflow.test.ts`.
- [ ] Not deployed (live `/requests/:id/approve` path exists only in the old revision) and the
      department-head approval queue is **empty in production**: live `GET /requests` as
      `dept.head@` returned `{"requests":[],"total":0}` while 10 requests exist.
- [ ] Two-stage approver routing (stage 1 releasing head / stage 2 receiving head) is not
      proven live.

### 10. Disposal
- [~] Code present — `buildDisposalChanges:149`, plus the disposal-cascade logic in
      `applyDecision`; returns the item to `COLLEGE` in the same write (per roadmap note).
- [ ] Not verified live; `lint` currently reports `isDisposal`/`isLoan`/`isStage2` assigned but
      unused in `requestWorkflow.ts:321–324`, i.e. that branch is mid-edit.

### 11. Loan / issue-and-return
- [~] `POST /requests/:id/return` exists (`requests.ts:672`), `returnLoan` exists
      (`requestWorkflow.ts:617`), `ItemStatus.LOANED` exists.
- [ ] `GET /loans/overdue` exists in code (`routes/loans.ts:15`) but the loans router exposes
      **only** that one route — no list, no create, no approve. 404 live.

### 12. Audit: freeze → scan → close → findings
- [~] Backend routes exist — `routes/audits.ts` `POST /` (34), `POST /:id/scan` (87),
      `POST /:id/complete` (168), `GET /` (335), `GET /:id` (474), `GET /active` (550),
      `GET /findings` (615); services `auditCompletion.test.ts` (12 tests) pass.
- [ ] The web audit screens are the ones currently failing: `auditHistory.test.tsx` (5),
      `auditReporting.test.tsx` (3), `auditScanToasts.test.tsx` (1) — all in the
      `useAudits.ts` refactor that is half-applied.
- [ ] `AuditListPage.tsx:146` and `AuditScanPage.tsx:70,116,144` do not compile.

### 13. Requests: typed, time-windowed, totals
- [~] `window` enum (`this-week|this-month|last-30-days|custom`) and the filtering exist —
      `routes/requests.ts:124,486–494`; `GET /requests/pending-count` (404) and
      `GET /requests/totals` (425) are separate routes.
- [ ] **`SYSTEM_ADMIN` can read `/requests` and the payload leaks asset data** — live 200 with
      `"item":{"tagId":"CNCS-DEMO-0002","name":"Office Desk"}` in each row, contradicting
      "System Administrator sees no asset data" (UI spec §SYSTEM_ADMIN). One of the rows is a
      transfer **requested by the System Admin account itself**.
- [ ] Live `GET /requests/pending` → 500 `Internal server error`.

---

## Phase C — Reports and integrity

### 14. Phase-1 reports by audience
- [~] `routes/reports.ts` + `reports.test.ts` exist; `frontend` Reports page and CSV utils exist.
- [ ] **`GET /reports/inventory` returns 500 in production** for both the Property Officer and
      the Auditor; 403 for staff/head.
- [ ] Live `/audits/findings` and `/audits/active` are 404 in production.
- [ ] "Frozen when official" is unconsumed: `reportNumber` is the only freeze-ish column in the
      schema (`schema.prisma:504`); no snapshot/frozen-at column exists.

### 15. Remaining security/integrity fixes
- [ ] The `/items` public-list leak (§Phase A.6) is the top item here.
- [ ] Staff/head by-id reads outside their scope (§Phase A.2).
- [ ] `SYSTEM_ADMIN` request/asset read leak (§Phase B.13).

---

## Phase D — Polish

- [ ] 16. Desktop QR scanner **still present** — `frontend/src/hooks/useQrScanner.ts`,
      `src/components/QrScanner.tsx`, `src/test/qrScanner.test.tsx`.
- [x] 17. Public informational landing page exists — `LandingPage` routed at
      `frontend/src/app/router.tsx:85`.
- [ ] 18. Bulk import with optional image column — no such route; `routes/uploads.ts` declares
      no bulk/import endpoint.
- [~] 19. Email provider — `backend/src/services/email.ts` exists with 5 tests; no provider
      credentials verified, Resend domain question still open.
- [~] 20. Map — mobile `test/widget/map_page_test.dart` passes; the web `/map` route exists
      (`router.tsx:86`). No live verification.
- [ ] 21. Polling at 30s — no `refetchInterval: 30_000`; the only interval found is
      `useHealth.ts:14` at 60s.

---

## Account-Approval Authority work (T1–T9) — `docs/cncs-pms-account-approval-authority.md`

### T1. Schema
- [~] `AccountRequest` exists (`schema.prisma:185–214`) with `requestedUnitId`,
      `confirmedUnitId`, `status`, `decidedBy`, `escalatedBy`, and the invite fields
      (`authorizedBy`, `authorizationRef`, `authorizationNote`, `invitedById`, `invitedAt`) —
      **but the invite fields are uncommitted working-tree changes** (not in `24fb728`).
- [~] `AdminActionLog` has `actorId`, `action`, `targetUserId`, `unitId`, `before`, `after`,
      and (uncommitted) `authorizedBy`/`authorizationRef`. Append-only is **not** enforced at
      DB level, and nothing writes to it.
- [ ] **No migration exists for the uncommitted fields** — `grep -rl "authorizedBy\|invitedById"
      backend/prisma/migrations/` returns nothing. The last migration on disk is
      `20261012030000_account_approval_queue`.

### T2. Capabilities
- [x] Server has all five — `permissions.ts:58–66`; `ACCOUNT_APPROVE_OWN_UNIT`→head
      (`:119`), `ACCOUNT_APPROVE_ANY`/`ACCOUNT_INVITE`/`ACCOUNT_DEACTIVATE_PRIVILEGED`→admin (`:82–84`).
- [x] Web mirrors the five — `frontend/src/lib/permissions.ts:32–36,43–44,73–74`.
- [ ] **Mobile does not** — `mobile/lib/models/permissions.dart` (see Phase A.1).
- [ ] No automated three-way comparison test.

### T3. `resolveApprover` / `canDecide`
- [x] `backend/src/services/approvers.ts` exists (`resolveApprover:11`, `canDecide:72`,
      `getUnitScope`) with tests.
- [x] `canDecide` is used in every approve/reject/escalate handler — `users.ts:216,314,387`.
- [~] `resolveApprover` is **imported and unused** in `users.ts` (eslint warning at
      `users.ts:20`), so the head→parent→SYSTEM_ADMIN fallback chain is not actually wired into
      the queue.

### T4. Staff registration backend
- [~] `GET /departments` is public and minimal — live 200 (4 units, no heads/counts).
- [~] `POST /auth/request-account` **is** `POST /auth/account-requests`
      (`routes/auth.ts:236`) and a web page calls it; no `staffId`, no
      `PENDING_EMAIL_VERIFICATION`, no identical-response-on-duplicate-email guarantee.
- [ ] `POST /auth/verify-email` — **does not exist** (auth router has only
      `/register`, `/account-requests`, `/login`, `/me`, `/change-password`).
- [~] Non-ACTIVE sign-in: `AccountStatus` enum has all five values (`schema.prisma:49–55`); the
      login gate is claimed by tests in `routes/auth.test.ts` but not verified live.

### T5. Staff approval queue backend
- [~] `GET /users/approvals`, `/:id/approve`, `/:id/reject`, `/:id/escalate` exist and are
      live (`users.ts:130,189,290,364`); head scope via `getUnitScope`; others 403/404.
- [ ] Head's SYSTEM_ADMIN-vs-head filters (escalated / headless / stale) are not implemented —
      `SYSTEM_ADMIN` simply sees all pending rows.
- [ ] `confirmedUnitId`, `AdminActionLog`, decision email, `APPROVAL_ESCALATION_DAYS` (see
      Phase A.4).
- [~] Live row support: `GET /users/approvals` as admin returned PENDING_APPROVAL accounts
      (`pending.cs@`, …), so the legacy queue has real data.

### T6. Privileged invites backend
- [ ] `POST /users/invite` — **does not exist**.
- [ ] `POST /auth/accept-invite` — **does not exist**.
- [ ] Duplicate head / PO+AUDITOR conflict / self-invite rejections — not implemented.
- [ ] Head activation side-effects (set `headUserId`, move department items to
      `REVERTED_UNVERIFIED`, reassign previous head's approvals) — not implemented.

### T7. Deactivation backend
- [ ] No deactivate endpoint. `DELETE /users/:id` is the only removal path, it requires
      `ACCOUNT_MANAGE`, is blocked when the account has a trail, and does **not** bump
      `tokenVersion`, move held items, or log anything.
- [ ] Self-deactivation is blocked in the delete path only (`users.ts` delete: "You cannot delete
      your own account").

### T8. Frontend (web)
- [~] `/request-account` page exists (`router.tsx:88`) and is linked from `LoginPage.tsx:111`.
      ⚠ It is the file that currently fails lint (`RequestAccountPage.tsx:49`).
- [~] `DEPARTMENT_OPTIONS`-style hardcoding: the page now fetches `/departments`
      (`RequestAccountPage.tsx:50–68`) — but that fetch is the code that fails the
      rules-of-hooks check.
- [ ] Verify-email page — does not exist.
- [~] Department Head "Account Requests" screen: nav points at `/account-requests`
      (`navConfig.ts:60`) but **no route is declared for it** → dead link.
- [~] SYSTEM_ADMIN: nav points at `/admin/account-requests` (`navConfig.ts:68`) and
      `/admin/system` (`navConfig.ts:69`) — **neither route exists**; only `/admin/users` is
      declared (`router.tsx:190`). Invite form/status list — not built.
- [ ] Test that every nav item resolves for every role — does not exist.

### T9. Seed data
- [x] Four departments with Physics headless; heads for CS/Bio/Chem; two staff each; one officer;
      one auditor; two SYSTEM_ADMIN candidates; pending staff — `backend/prisma/seed.ts`
      (CS/Bio/Chem heads at :142,156,170; `staff.cs1/cs2`, `staff.bio1/2`, `staff.chem1`;
      `pending.cs/bio/phys` at :460–494), and the live API shows exactly these 21 accounts.
- [x] No real personal data in the seed.

### Live verification table (§4 of the authority doc)
- [ ] **Rows 1–20 have not been run.** Only these adjacent facts were established live: the
      admin `GET /items` = 0 (§2), staff/head by-id reads return 200 (§2), `SYSTEM_ADMIN` sees
      `/requests` with item names (§13), head queue empty in production (§9), anonymous
      `/items` = 200 + 9 items (§6).

---

## Role-Based UI spec — `docs/archive/role-based-ui-spec.md`

> The doc's own header lists **5** roles (SYSTEM_ADMIN, PROPERTY_OFFICER, DEPARTMENT_HEAD, STAFF,
> AUDITOR). The 6th role you asked about, `ACCOUNT_ADMIN`, was merged into `SYSTEM_ADMIN`
> (12 Oct) and is gone from the backend and web — it survives only in `mobile`.

### Navigation
- [x] Nav is data-driven with role filtering — `frontend/src/app/navConfig.ts:52–72`,
      `visibleNavItems()` at `:74`.
- [x] Badge kinds implemented (`pending-count`, `unread-notifications`) — `navConfig.ts:33–40`.
- [x] SYSTEM_ADMIN nav has no Scan/Items/Requests/Reports — confirmed in `navConfig.ts`.
- [x] AUDITOR nav is Dashboard / Active Audit / Audit history / Notifications — `navConfig.ts:63,64`.
- [~] STAFF nav is Dashboard / My Items / My Requests / Notifications — correct in config.
- [~] PROPERTY_OFFICER nav adds Buildings (`:62`) **with no route** → Page-not-found.
- [~] DEPARTMENT_HEAD nav adds Account Requests (`:60`) **with no route** → Page-not-found.
- [ ] "Scan a Tag" is `roles: ["PROPERTY_OFFICER"]` only (`:53`) — the spec's emphasis for
      duties and the E6 note "desktop shows manual tag lookup" are unverified.
- [ ] Test that iterates every role's nav and asserts the route renders — does not exist.

### Dashboard widgets per role
- [x] All nine widget files exist — `frontend/src/features/dashboard/widgets/`: SystemStatus,
      RecentSystemEvents, RecentlyRegisteredItems, OverdueLoans, HeldItems, DepartmentRoster,
      CurrentAuditProgress, OpenFindings, AuditHistoryQuickList.
- [~] Only PROPERTY_OFFICER and DEPARTMENT_HEAD branches are explicitly wired in
      `DashboardPage.tsx:93,101`; the SYSTEM_ADMIN/AUDITOR branches were not verified.
- [~] `/items/recent` and `/items/held-by-me` were added but are **unreachable at HEAD**:
      `/:tagId` is registered at `items.ts:366`, *before* `/recent` (`:982`) and
      `/held-by-me` (`:1014`), so Express matches the generic route first and answers
      `{"error":"Item not found"}`. Live behaviour confirms the mechanism — in the deployed
      revision (`personal/main`) `/recent` is declared *before* `/:tagId` and works, while
      `/held-by-me` is declared *after* it and 404s exactly like this.
- [ ] `/admin/system/status` — the widget calls `/api/v1/admin/system/status`, but the backend
      mounts the router at `/api/v1/system` (`app.ts:116`), and live
      `/admin/system/status` → 404 "Route not found" while `/system/status` → 200.
- [ ] Live `/system/events` returns rows with `type: "AUDIT"` — the spec says system events must
      be "explicitly NOT asset/item/request activity".

### Notification rules (§9)
- [~] Generation-time capability targeting partially exists —
      `backend/src/services/notifications.ts` exports `resolveReviewerRecipients:149`,
      `notifyReviewersOfNewRequest:175`, `notifyRequesterOfDecision:210`; 16 tests pass.
- [ ] Account-request notification capabilities are named `ACCOUNT_APPROVE_DEPARTMENT` /
      `ACCOUNT_APPROVE_SYSTEM` in this spec but `ACCOUNT_APPROVE_OWN_UNIT` /
      `ACCOUNT_APPROVE_ANY` in the code — the spec text is stale.
- [ ] "Check existing notifications for violations and clean up" — unverified, and it is a
      post-deploy data task.

### Collapsed sidebar
- [ ] Not verified this session (no browser pass). Sources exist (`frontend/src/app/AppLayout.tsx`,
      `src/test/mobileDrawer.test.tsx`), but "collapsed state persists per user" was not checked.

---

## Registration-Hierarchy task list — `docs/archive/cncs-pms-registration-hierarchy-task-list.md`

Amended by the authority doc where they differ. Phases A–H.

- [~] A1 Org unit tree — `OrgUnit` exists and is live (`GET /departments` returns 4); the
      `Department`→`OrgUnit` decision is documented as done, but the "one head per unit / head's
      unit must match" constraints are unverified.
- [~] A2 `User` fields — `orgUnitId` is on `User` (used by `resolveApprover`/`getUnitScope`);
      **`staffId` does not appear anywhere in `backend/src` or the schema**.
- [~] A3 `AccountRequest` + `EmailToken` + `AdminActionLog` — models exist; `EmailToken` is
      unused (no verify/reset flow), `AdminActionLog` is never written.
- [x] A4 Seed data (see T9), including the "no real data" rule.
- [~] B1 capabilities (see T2) — server+web yes, mobile no.
- [~] B2 `approvers.ts` (see T3) — `canDecide` wired, `resolveApprover` not.
- [~] C1 public `GET /departments` — live, minimal, **not** rate-limited as the task requires
      (no `rateLimit` on that route).
- [~] C2 `POST /auth/request-account` — exists as `/auth/account-requests`; missing `staffId`,
      domain allow-list, duplicate-email opacity.
- [ ] C3 `POST /auth/verify-email` — missing.
- [~] C4 login status gate — enum + tests exist; not verified live.
- [~] D1 `GET /users/approvals` — exists on the legacy model; SYSTEM_ADMIN filters missing.
- [~] D2 approve — exists; `confirmedUnitId`/log/email missing.
- [x] D3 reject — reason required and length-checked (`users.ts` reject handler + schema).
- [~] D4 escalate — exists, but via a `reviewNote` marker rather than `escalatedAt`.
- [ ] D5 escalation job / lazy-on-read — missing.
- [~] D6 backend tests — CS-head-only-scope, no-reason-400, staff-404 and out-of-scope-404
      cases exist in `backend/src/routes/users.test.ts` (edits made this session) and pass;
      the Physics-headless and escalated-leaves-queue cases were not verified.
- [ ] E1 request-account page fields (Staff ID, notice text, resend) — partial; the page fails
      lint.
- [ ] E2 verify-email page — missing.
- [~] E3 sign-in messages for non-ACTIVE — unverified.
- [~] E4 head Account Requests screen — nav entry only; no route, no screen.
- [~] E5 SYSTEM_ADMIN screen — nav entry only; no route, no invites.
- [ ] E6 "every nav item resolves for that role" — **fails today** for `/buildings`,
      `/admin/system`, `/admin/account-requests`.
- [ ] E7 front-end tests for registration/queue/sign-in states — partial (one
      `requestAccount.test.tsx`, currently failing).
- [~] F1 one scope function used by list/search/scan/report — `itemListScope` covers the item
      listing; scan (`GET /items/:id`) is **not** scope-checked; report queries unverified.
- [ ] F2 scan behaviour for out-of-scope tags — not implemented.
- [ ] F3 multi-department proof tests — not verified.
- [ ] G1 invites — missing (see T6).
- [ ] G2 deactivation — missing (see T7).
- [ ] G3 head replacement — missing.
- [~] G4 role change bumps `tokenVersion` — yes for promote (`users.ts`), and it is logged
      nowhere.
- [~] H notifications — partial (see §Notification rules).

---

## 4. Deployment / environment facts

- [x] Vercel account `hayredin950-8456`; projects `cncs-pms-web` and `cncs-pms-api` both linked
      to the personal GitHub repo (`…-git-main-hayredins-projects.vercel.app` aliases).
- [x] Production web Ready — `cncs-pms-web-k2n82b64c…`, Deployed 14 Oct 09:28 EAT.
- [x] Production API Ready — `cncs-pms-api-3fcfic6ae…`, same timestamp. Its bundle serves the
      **old** route set (§0), so it was built from a checkout that is not this branch.
- [ ] Recent deploys errored: web preview `cncs-pms-dbq46lwu6` (Error, 59m), api prod
      `cncs-pms-no0vslvyv` (Error), web preview `cncs-pms-rkap7wia4` (Error). Root cause not yet
      read from the build logs.
- [x] `vercel.json` at the repo root is **untracked** (an `experimentalServices` monorepo config);
      `frontend/vercel.json` and `backend/vercel.json` are tracked.
- [ ] Deployment → git commit mapping cannot be read back: neither project has git metadata on
      its deployments (all CLI uploads).

---

## 5. Things to decide before more code is written

- [ ] **D1 (authority doc): does the head approve own-unit staff, or is SYSTEM_ADMIN the only
      approver?** The code implements the legacy "SYSTEM_ADMIN approves" flow; the doc's
      recommended answer changes who owns `GET /users/approvals`.
- [ ] Which flow is canonical going forward: legacy `User.accountStatus`, or
      `AccountRequest`? They currently coexist with only one live.
- [ ] Does `mobile` get aligned to the five roles (and its own CI), or is mobile frozen?
- [ ] Should `GET /items` require auth outright (breaking the public landing/map pages), or stay
      authenticated-optional but fail closed on a bad token and return nothing anonymous?
- [ ] Is `SYSTEM_ADMIN` allowed to read `/requests` at all? It currently returns item names.
