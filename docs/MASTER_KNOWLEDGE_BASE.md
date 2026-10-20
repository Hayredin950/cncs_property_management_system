# CNCS Property Management System — Master Knowledge Base

**Generated:** 2026-10-20 | **Basis:** Full codebase audit + all docs (active + archive) + GitHub  
**Authority:** This document supersedes all other docs for AI agent implementation guidance.  
**Living document rule:** Every `[DONE]` was verified in code. Every `[BROKEN]` was confirmed broken. Every `[BUILD]` does not exist yet. Do not re-verify `[DONE]` from scratch; do not trust a `[BROKEN]` item's existing tests.

---

## 0. GROUND RULES (Non-Negotiable)

1. Nothing is "done" until verified live — real HTTP call or browser click-through, actual response pasted.
2. Server decides every permission. Never trust `role`, `unitId`, or `approverId` from a client payload.
3. Out-of-scope access returns **404**, not 403 — do not reveal that a resource exists.
4. Every state-changing action writes to an append-only log (`AdminActionLog` for accounts, `CustodyEvent` for items).
5. Backend endpoint, frontend caller, and test ship **together** — never commit a route with no UI wired to it.
6. No hard deletes. Items → `VOIDED`. Users → `DEACTIVATED`. Logs are append-only.
7. The `phase-a-b-complete` branch is canonical (38 commits ahead of `main`). **Do not build on `main`.**

---

## 1. PROJECT OVERVIEW

| Property | Value |
|---|---|
| System | CNCS Property Management System |
| Institution | College of Natural and Computational Sciences (CNCS), Addis Ababa University (AAU) |
| Purpose | Track non-consumable campus assets with QR-tag identification, transfer/disposal approval workflows, and audit reconciliation |
| Scale | Tens of thousands of assets, thousands of staff across multiple departments |
| Backend URL | https://cncs-pms-api-hayredins-projects.vercel.app |
| Frontend URL | https://cncs-pms-web-hayredins-projects.vercel.app |
| Repository | https://github.com/Hayredin950/cncs_property_management_system |
| Canonical branch | `phase-a-b-complete` @ `24fb728` |
| CI status | **RED** — 9 consecutive failures on `phase-a-b-complete` |
| Production revision | Running old `personal/main`, not the canonical branch |

---

## 2. TECH STACK

### Backend
- **Runtime:** Node.js 22
- **Framework:** Express 5 + TypeScript (strict)
- **Database:** PostgreSQL (hosted on Neon, free tier)
- **ORM:** Prisma 7 with `prisma.config.ts` pattern + Neon driver adapter
- **Auth:** JWT (1-day expiry) + argon2id password hashing
- **Package manager:** pnpm
- **Containerization:** Docker
- **Deployment:** Vercel Hobby (serverless function via `backend/api/index.js`)
- **Photo storage:** Cloudinary (cloud `r3rzw77s`)
- **Email:** Resend stub (transport not configured; `NOTIFY_EMAIL=false`)

### Frontend
- **Framework:** React 19 + Vite + TypeScript (strict)
- **Styling:** Tailwind CSS 4 (CSS-first `@theme` pattern)
- **Routing:** React Router v6 (data router)
- **Server state:** TanStack Query v5
- **Forms:** react-hook-form + zod
- **QR scanning:** html5-qrcode
- **Icons:** lucide-react
- **Toasts:** sonner
- **Testing:** Vitest + React Testing Library + MSW
- **Deployment:** Vercel static (SPA + Vercel Functions for social previews)
- **Brand:** AAU visual identity (Geist Sans, AAU blue/red palette, real crest)

### Mobile
- **Framework:** Flutter (Dart)
- **Architecture:** GoRouter for navigation, Riverpod-like providers
- **Testing:** Flutter test (54 tests passing)
- **CI:** **No CI workflow exists for mobile**
- **Critical bug:** Still has 6-role model (`ACCOUNT_ADMIN` in enums.dart) — must be fixed to 5 roles

---

## 3. ORGANIZATIONAL HIERARCHY

```
College (CNCS — single college in scope)
  └── Department (Computer Science, Biology, Chemistry, Physics)
        └── Individual (STAFF / DEPARTMENT_HEAD holding personally)
```

- `OrgUnit` table is self-referencing with `parentId` and `type` (COLLEGE, DEPARTMENT, LAB_GROUP)
- Physics has **no head** by design (tests the vacant-head fallback path)
- One head per unit; one user heads at most one unit
- `acceptsSelfReg` flag on OrgUnit controls self-registration eligibility

---

## 4. ROLES (FINAL — 5 ROLES)

```
SYSTEM_ADMIN      — Technical + account administration ONLY.
                    Zero asset data. Zero asset approvals.
                    
PROPERTY_OFFICER  — College-wide operational authority.
                    Registers items, approves all asset workflows,
                    runs/views audits, manages buildings, full reports.
                    
DEPARTMENT_HEAD   — Department-scoped authority.
                    Approves own-unit staff registrations.
                    Approves department transfer/disposal/loan requests.
                    Can hold items personally like staff.
                    
STAFF             — Self-scoped custodian.
                    Files requests only. Never registers/edits/approves.
                    
AUDITOR           — Read-only audit role.
                    Runs audit sessions, reviews findings.
                    No approvals, no item edits.
```

**IMPORTANT:** Mobile (`mobile/lib/models/enums.dart`) still has a 6th role `ACCOUNT_ADMIN` that must be deleted.

---

## 5. CAPABILITY MATRIX (Single Source of Truth)

| Capability | SYSTEM_ADMIN | PROPERTY_OFFICER | DEPARTMENT_HEAD | STAFF | AUDITOR |
|---|:---:|:---:|:---:|:---:|:---:|
| `ITEM_CREATE` | — | ✅ | — | — | — |
| `ITEM_EDIT_IDENTITY` | — | ✅ | — | — | — |
| `ITEM_EDIT_CUSTODY` | — | ✅ | ✅ (own items) | ✅ (own items) | — |
| `ITEM_CLAIM` | — | ✅ | ✅ | ✅ | — |
| `ITEM_VOID` | — | ✅ | — | — | — |
| `ITEM_READ_ALL` | — | ✅ | ✅ | — | ✅ |
| `BUILDING_MANAGE` | — | ✅ | — | — | — |
| `TAG_MANAGE` | — | ✅ | — | — | — |
| `CATEGORY_MANAGE` | — | ✅ | — | — | — |
| `AUDIT_RUN` | — | — | — | — | ✅ |
| `AUDIT_VIEW` | — | ✅ | — | — | ✅ |
| `REQUEST_DECIDE` | — | ✅ | ✅ (own dept) | — | — |
| `TRANSFER_APPROVE_STAGE1` | — | ✅ | ✅ (releasing) | — | — |
| `TRANSFER_APPROVE_STAGE2` | — | ✅ | ✅ (receiving) | — | — |
| `DISPOSAL_APPROVE` | — | ✅ | — | — | — |
| `DISPOSAL_REVERSE` | — | ✅ | — | — | — |
| `LOAN_APPROVE` | — | ✅ | — | — | — |
| `REQUEST_READ_ALL` | — | ✅ | — | — | — |
| `REPORT_VIEW_ALL` | — | ✅ | ✅ | — | ✅ |
| `ACCOUNT_MANAGE` | ✅ | — | — | — | — |
| `ACCOUNT_APPROVE_OWN_UNIT` | — | — | ✅ | — | — |
| `ACCOUNT_APPROVE_ANY` | ✅ | — | — | — | — |
| `ACCOUNT_INVITE` | ✅ | — | — | — | — |
| `ACCOUNT_DEACTIVATE_OWN_UNIT` | — | — | ✅ | — | — |
| `ACCOUNT_DEACTIVATE_PRIVILEGED` | ✅ | — | — | — | — |
| `SYSTEM_CONFIG` | ✅ | — | — | — | — |
| `USER_READ` | ✅ | ✅ | — | — | — |

**Mirror this in:**
- `backend/src/services/permissions.ts` ✅ (verified)
- `frontend/src/lib/permissions.ts` ✅ (verified)
- `mobile/lib/models/permissions.dart` ❌ MISSING `ACCOUNT_*` capabilities — **must fix**

---

## 6. DATABASE SCHEMA (Verified from `backend/prisma/schema.prisma`)

### Core Models

```
User {
  id, fullName, email (unique), passwordHash
  role: Role (5-value enum)
  accountStatus: AccountStatus (default PENDING_EMAIL_VERIFICATION)
  orgUnitId → OrgUnit (nullable)
  staffId (unique, nullable — required for STAFF self-reg)
  tokenVersion (Int, default 0 — bumped on password/role change)
  mustChangePassword (Boolean, being retired)
  reviewedById, reviewedAt, reviewNote (approval queue)
  escalatedAt, escalatedById (escalation)
}

Item {
  id, tagId (unique), pin (unique — lifetime, never reused)
  name, categoryId → Category
  orgUnitId → OrgUnit (nullable)
  buildingId → Building (nullable)
  floor, room
  holderType: HolderType (STAFF | DEPARTMENT | COLLEGE)
  holderId (nullable — null when COLLEGE)
  ownerId → User (legacy — to be removed in contract slice)
  purchaseCost (Decimal), currentValue (Decimal, nullable)
  condition: Condition (NEW|GOOD|FAIR|DAMAGED|BEYOND_REPAIR)
  brand, model, serialNumber, photoUrl, notes (all optional)
  status: ItemStatus (see state machine below)
  version (Int — optimistic locking)
  disposalReason, disposedAt
  claimedAt, claimDueAt (claim handshake)
  lastVerifiedAt, lastVerifiedById
  voidReason, voidedAt, voidedById
  registeredAt, lastAuditedAt
  parentItemId (accessories — set only via accessories endpoint)
}

Request {
  id, type: RequestType (TRANSFER|DISPOSAL|LOAN)
  status: RequestStatus
  itemId → Item, requestedById → User
  reviewedById, reason, rejectionReason
  newLocationBuilding, newLocationFloor, newLocationRoom
  newOwnerId (legacy), fromHolder*, toHolder* (new)
  stage1ApprovedById, stage1ApprovedAt
  stage2ApprovedById, stage2ApprovedAt
  loanDueDate, loanReturnedAt, loanReturnedById
  withdrawnAt, withdrawnById, invalidatedAt, invalidatedReason
  createdAt, decidedAt
}

AuditSession {
  id, sessionType, reportNumber (unique)
  scopeType, scopeValue
  runById → User
  startedAt, completedAt, graceEndsAt
  results: AuditItemResultRow[]
}

AuditItemResultRow {
  auditSessionId → AuditSession
  itemId → Item
  result: AuditItemResult (PENDING|FOUND|MISSING|LOCATION_MISMATCH|DAMAGED)
  scannedAt
  @@unique([auditSessionId, itemId])  ← DB-level uniqueness
}

OrgUnit { id, name, code, type, isActive, acceptsSelfReg, parentId, headId }
AccountRequest { userId, requestedUnitId, confirmedUnitId, status, ... invite fields }
EmailToken { userId, type (VERIFY|INVITE|RESET), tokenHash, expiresAt, usedAt }
AdminActionLog { actorId, action, targetUserId, unitId, before, after, authorizedBy, authorizationRef }
CustodyEvent { itemId, eventType, fromHolder*, toHolder*, actingUserId, reason, departmentHeadSnapshot }
Building { id, name (unique), code (unique), description, address }
Category { id, name (unique) }
Notification { userId, message, relatedRequestId, isRead }
ItemEditLog { itemId, editedById, fieldChanged, oldValue, newValue, editedAt }
```

### Item Status State Machine
```
PENDING_CLAIM → ACTIVE ↔ REVERTED_UNVERIFIED
ACTIVE → LOANED → ACTIVE (on return)
ACTIVE → LOST
ACTIVE → DISPOSED (terminal — reversible only by DISPOSAL_REVERSE)
ACTIVE → VOIDED (terminal — data correction only, no transfer history)
```

### Request Status Machine
```
PENDING → PENDING_STAGE1 → PENDING_STAGE2 → APPROVED
                                           ↘ REJECTED
PENDING* → WITHDRAWN (by requester, before any approval)
PENDING* → INVALIDATED (auto, when item status changes)
APPROVED (loan) → RETURN_PENDING_CONFIRMATION → APPROVED (loan closed)
```

### Migrations (in order)
1. `20260901115514_init` — initial schema
2. `20260924000000_add_token_version_and_password_reset` — tokenVersion, mustChangePassword
3. `20261012000000_phase_a_expand` — **FAILED row in `_prisma_migrations`** — requires `prisma migrate resolve` before next deploy
4. `20261012010000_role_five_role_enum` — 5-role enum
5. `20261012020000_backfill_holder_fields` — holderType/holderId
6. `20261012030000_account_approval_queue` — AccountRequest/EmailToken/AdminActionLog tables (created OUTSIDE migration history — tables exist but no migration created them)
7. `20261014000000_account_invite_fields` — 7 invite columns (on disk, **NOT applied to live DB**)
8. `20261017102500_delete_system_admin_item_notifications` — filter notifications

---

## 7. BACKEND ROUTE INVENTORY

### Mounted Routers (from `backend/src/app.ts`)
All routes available at both `/api/v1/<path>` and `/<path>`.

| Router | File | Key Routes |
|---|---|---|
| auth | `routes/auth.ts` | POST /login, GET /me, POST /account-requests, POST /accept-invite, POST /change-password, POST /request-password-reset, POST /reset-password |
| users | `routes/users.ts` | GET /users/approvals, POST /:id/approve, POST /:id/reject, POST /:id/escalate, POST /users/invite, GET /users, PATCH /:id, POST /:id/promote, POST /:id/password, DELETE /:id |
| items | `routes/items.ts` | GET /, POST /, GET /:tagId, PUT /:id, POST /:id/claim, POST /:id/refuse-claim, POST /:id/void |
| accessories | `routes/accessories.ts` | POST /items/:id/accessories, DELETE /items/:id/accessories/:accessoryId |
| itemHistory | `routes/itemHistory.ts` | GET /items/:id/history |
| tags | `routes/tags.ts` | GET /items/:id/tag, POST /items/:id/tag/regenerate |
| requests | `routes/requests.ts` | GET /, POST /, GET /pending-count, GET /totals, GET /:id, POST /:id/approve, POST /:id/reject, POST /:id/withdraw, POST /:id/return |
| audits | `routes/audits.ts` | POST /, POST /:id/scan, POST /:id/complete, GET /, GET /active, GET /findings, GET /:id |
| reports | `routes/reports.ts` | GET /inventory, GET /audit/:auditId, GET /disposals |
| notifications | `routes/notifications.ts` | GET /, POST /:id/read, POST /read-all, DELETE /:id, DELETE / |
| departments | `routes/departments.ts` | GET / (public), GET /invitable |
| buildings | `routes/buildings.ts` | GET /, POST /, GET /:id, PUT /:id, DELETE /:id |
| categories | `routes/categories.ts` | GET /, POST /, GET /:id |
| uploads | `routes/uploads.ts` | POST /photo |
| loans | `routes/loans.ts` | GET /overdue |
| systemConfig | `routes/systemConfig.ts` | GET /system/status, GET /system/events |
| catalog | `routes/catalog.ts` | GET /catalog (Staff-visible restricted catalog) |
| expiry | `routes/expiry.ts` | POST /expiry/run (trigger expiry/escalation job) |
| export | `routes/export.ts` | GET /export |

### Critical Backend Services
- `services/permissions.ts` — capability matrix
- `services/approvers.ts` — `resolveApprover()`, `canDecide()`
- `services/requestWorkflow.ts` — transfer/disposal/loan approval logic
- `services/holder.ts` — custody transitions, `CustodyEvent` writing
- `services/itemScope.ts` — `itemListScope()` — scope filter by role
- `services/invites.ts` — privileged invite logic (`assertInvitable`)
- `services/notifications.ts` — notification generation
- `services/auditCompletion.ts` — audit FOUND/MISSING/MISMATCH computation
- `services/expiry.ts` + `services/expiryEscalation.ts` — claim/loan expiry, escalation
- `services/accountApproval.ts` — account approval helpers
- `services/itemEditLog.ts` — edit history writing
- `lib/prisma.ts` — pool config + retry wrapper (db-connection-resilience fix)
- `lib/dbRetry.ts` — `withConnectionRetry()` — 4 attempts with backoff

---

## 8. FRONTEND ROUTE INVENTORY

### Public Shell (PublicLayout)
| Route | Component | Notes |
|---|---|---|
| `/` | LandingPage | Search, scan CTA, recently added items |
| `/map` | MapPage | Building grouping (no real map) |
| `/login` | LoginPage | |
| `/request-account` | RequestAccountPage | Staff self-registration (fetches /departments) |
| `/accept-invite` | AcceptInvitePage | Invite acceptance (token in query param) |
| `*` | NotFoundPage | 404 catch-all |

### SmartLayout (public + authenticated combined)
| Route | Component | Notes |
|---|---|---|
| `/items` | ItemsBrowsePage | Paginated + filtered items list |
| `/scan` | ScanPage | Camera + manual tag entry |
| `/item/:tagId` | ItemDetailPage | QR destination — public or staff detail |

### Authenticated Shell (AppLayout, RequireAuth)
| Route | Roles | Component |
|---|---|---|
| `/dashboard` | ALL | DashboardPage |
| `/change-password` | ALL | ChangePasswordPage |
| `/notifications` | ALL | NotificationsPage |
| `/catalog` | ALL asset roles | CatalogPage (staff-visible restricted catalog) |
| `/departments/:id` | DEPARTMENT_HEAD | DepartmentDetailPage |
| `/items/:id/edit` | ASSET_ROLES | ItemFormPage (mode="edit") |
| `/items/:id` | ASSET_ROLES | ItemStaffPage |
| `/requests` | ASSET_ROLES | RequestsListPage |
| `/requests/new` | ASSET_ROLES | RequestFormPage |
| `/requests/:id` | ASSET_ROLES | RequestDetailPage |
| `/items/new` | PROPERTY_OFFICER | ItemFormPage (mode="create") |
| `/admin/categories` | PROPERTY_OFFICER | AdminCategoriesPage |
| `/audits` | PROPERTY_OFFICER, AUDITOR | AuditListPage |
| `/audit/:id/report` | PROPERTY_OFFICER, AUDITOR | AuditReportPage |
| `/reports` | PROPERTY_OFFICER, AUDITOR | ReportsPage |
| `/audit/new` | AUDITOR | AuditNewPage |
| `/audit/:id/scan` | AUDITOR | AuditScanPage |
| `/admin/users` | SYSTEM_ADMIN, DEPARTMENT_HEAD | AdminUsersPage |
| `/admin/system` | SYSTEM_ADMIN | SystemStatusPage |

### Navigation Config per Role
| Role | Nav Items |
|---|---|
| SYSTEM_ADMIN | Dashboard, Accounts (badge), System Status, Notifications |
| PROPERTY_OFFICER | Dashboard, Scan a Tag, Browse Items, Requests (badge), New item, Audit history, Reports, Notifications, Categories |
| DEPARTMENT_HEAD | Dashboard, Browse Items (dept scope), Department Requests (badge), Accounts (badge), Notifications |
| STAFF | Dashboard, Browse Items (my scope), My Requests, Notifications |
| AUDITOR | Dashboard, Active Audit, Audit history, Reports, Notifications |

### Frontend API Layer (`frontend/src/api/`)
- `auth.ts` — login, me, requestAccount, acceptInvite, changePassword
- `items.ts` — CRUD, claim, void, recent, held-by-me
- `requests.ts` — list, create, approve, reject, withdraw
- `audits.ts` — create, scan, complete, list, active, findings
- `reports.ts` — inventory, audit, disposals CSV/PDF
- `users.ts` — list, invite, approve, reject, promote
- `departments.ts` — list (public), invitable
- `notifications.ts` — list, read, delete
- `uploads.ts` — photo upload
- `catalog.ts` — staff catalog browse
- `system.ts` — status, events
- `loans.ts` — overdue loans
- `categories.ts` — list, create

---

## 9. COMPLETE STATUS AUDIT

### ✅ DONE (Verified in Code)

**Backend:**
- 5-role enum + permissions matrix
- JWT auth middleware (`authenticate`, `requireRole`, `requireCapability`, `optionalAuthenticate`)
- argon2id password hashing
- Rate limiting on auth endpoints
- Item CRUD with scope filtering (`itemListScope`)
- QR tag generation + sticker rendering
- Field filtering (`sanitizeItem`) — server-side, not client-side
- Optimistic locking on items (`version` column)
- DB-level uniqueness on PIN, tag ID, audit result rows
- `CustodyEvent` append-only log model
- Transfer/disposal/loan request workflow (`requestWorkflow.ts`)
- Two-stage transfer approval (stage1 releasing, stage2 receiving head)
- Audit sessions: create, scan, complete, list, findings
- Audit completion: FOUND/MISSING/LOCATION_MISMATCH classification
- Reports: inventory, audit, disposals (CSV + PDF)
- In-app notifications (generation, read, delete)
- Photo upload to Cloudinary
- Privileged invites (`POST /users/invite`, `POST /auth/accept-invite`)
- `resolveApprover` + `canDecide` services
- Account approval queue (`GET /users/approvals`, approve/reject/escalate)
- `tokenVersion` bump on role change + password change
- DB connection resilience (`withConnectionRetry`, pool tuning)
- Static route ordering fix (recent/held-by-me/active/findings above `:param` routes)
- Buildings CRUD
- Departments endpoint (public + invitable)
- Catalog endpoint (staff-visible restricted view)
- Expiry/escalation services
- `AdminActionLog` written for invite actions (T6)
- Seed data: CS/Bio/Chem heads + staff, Physics headless, 2 SYSTEM_ADMINs, 1 officer, 1 auditor
- `navRoutes.test.tsx` — asserts every nav item resolves for every role

**Frontend:**
- AAU visual identity (Geist Sans, real palette, crest, header/footer/sidebar)
- Full route tree with role guards
- Smart layout (handles both public + authenticated shells on shared routes)
- Auth context + TanStack Query setup
- All API client calls through `apiClient.ts` (token attached, error normalized)
- Item registration/edit form (photo upload, accessories, history)
- Transfer/disposal request form + detail + approve/reject
- Audit walkthrough (new → scan → report)
- Reports page (inventory/disposals/audit CSV+PDF download)
- Notifications inbox (read, dismiss, clear all)
- Admin users page (list, invite, approve/reject, role change)
- Admin categories page
- System status + events dashboard (SYSTEM_ADMIN)
- Dashboard widgets: SystemStatus, RecentSystemEvents, OverdueLoans, HeldItems, DepartmentRoster, CurrentAuditProgress, OpenFindings, AuditHistoryQuickList, RecentlyRegisteredItems
- Social preview function (`frontend/api/preview.ts`)
- QR scanner (`useQrScanner.ts`, `QrScanner.tsx`)
- RequestAccountPage (fetches /departments — no hardcoded list)
- AcceptInvitePage
- DepartmentDetailPage (DEPARTMENT_HEAD)
- CatalogPage (Staff restricted browse)
- ChangePasswordPage

**Mobile:**
- Flutter app structure (54 tests pass)
- Router with all main screens
- Auth controller
- Item browse, detail, scan
- Request screens
- Audit screens
- Notifications
- Admin screens (invite, approvals)
- RequestAccountPage

---

### ❌ BROKEN (Code Exists But Doesn't Work Correctly)

| # | What's Broken | Location | Fix Required |
|---|---|---|---|
| B1 | **CI is RED** — 9 consecutive failures | `.github/workflows/` | Fix web build (B3) first, then tsc errors |
| B2 | **Production runs wrong revision** — 404s on routes that exist in code | Vercel `cncs-pms-api` | Deploy `phase-a-b-complete` after B3 fix; prove behaviorally |
| B3 | **Web build has 15 tsc errors + dirty working tree** | `frontend/src/features/audits/` | Caused by commit `bd1cc65` deleting audit hooks. Fix: finish the uncommitted partial restoration or revert `bd1cc65` and reapply legitimate additions only |
| B4 | **Audit test failures** (10 failing): auditHistory, auditReporting, auditScanToasts | `frontend/src/test/` | Same cause as B3 — hook signatures mismatch |
| B5 | **`migrate deploy` blocked** — FAILED row in `_prisma_migrations` for `20261012000000_phase_a_expand` | DB | Run `prisma migrate resolve --rolled-back 20261012000000_phase_a_expand` |
| B6 | **Invite columns missing from live DB** — `AccountRequest.authorizedBy` etc. don't exist | Neon DB | Apply migration `20261014000000_account_invite_fields` after B5 fix |
| B7 | **`resolveApprover` is unused** — imported but not wired into the queue | `backend/src/routes/users.ts:20` | Wire into every approve/reject/escalate handler (already wired for `canDecide`, not for `resolveApprover` itself) |
| B8 | **SYSTEM_ADMIN can read `/requests`** with item names (asset data leak) | `backend/src/routes/requests.ts` | `scopeToViewer` maps SYSTEM_ADMIN to empty filter — verify this is actually applied |
| B9 | **`ownerId` still returned by API** alongside holder fields (legacy leak) | `backend/src/routes/items.ts` | Stop returning `ownerId` in API responses; holder fields are the only source of truth |
| B10 | **Mobile 6-role bug** — `ACCOUNT_ADMIN` still in `enums.dart` | `mobile/lib/models/enums.dart:21` | Delete `ACCOUNT_ADMIN`, add 5 `ACCOUNT_*` capabilities |
| B11 | **Deactivation endpoint missing** — `DELETE /users/:id` is hard-delete with no audit trail | `backend/src/routes/users.ts` | Replace with status change + `tokenVersion` bump + items move to `REVERTED_UNVERIFIED` |
| B12 | **`AdminActionLog` never written** for approval decisions | Backend approval handlers | Write to `AdminActionLog` on every approve/reject/escalate |
| B13 | **`POST /auth/verify-email` doesn't exist** | `backend/src/routes/auth.ts` | Must be built (T4 in account authority doc) |
| B14 | **Escalation stored as string** `"[ESCALATED]"` in `reviewNote` | `backend/src/routes/users.ts:151,414` | Replace with real `escalatedAt`/`escalatedById` status mechanism |
| B15 | **`isDisposal`/`isLoan`/`isStage2` assigned-but-unused lint warnings** | `backend/src/services/requestWorkflow.ts:321-324` | Finish the incomplete branches |
| B16 | **Social preview broken** — `/api/v1/items/:tagId` now requires auth (public route removed), so link previews fall back to generic card | `frontend/api/preview.ts` | Update preview function to use correct auth or a dedicated public endpoint |
| B17 | **`staffId` doesn't exist in schema** for `POST /auth/account-requests` | `backend/src/routes/auth.ts` | Add `staffId` to `User` model and registration flow |
| B18 | **Department Head request queue empty** — head's approval queue returns `{"requests":[],"total":0}` when requests exist | `backend/src/routes/requests.ts` | Trace + fix approver resolution logic |

---

### 🔨 BUILD (Doesn't Exist Yet)

| # | What to Build | Priority | Notes |
|---|---|---|---|
| N1 | **Deactivation backend** (T7) | HIGH | Head deactivates staff; SYSTEM_ADMIN deactivates heads/auditors; bump `tokenVersion`; move held items to `REVERTED_UNVERIFIED`; log |
| N2 | **Email verification flow** (T4) — `POST /auth/verify-email` | HIGH | Consumes token, sets `PENDING_APPROVAL`, notifies approver |
| N3 | **Department Head approval screen** (T8) — `/account-requests` route + screen | HIGH | Route exists in router as `/admin/users` for DEPARTMENT_HEAD; dedicated screen needed |
| N4 | **Request withdrawal** — `POST /requests/:id/withdraw` | MEDIUM | Only requester, only while PENDING/PENDING_STAGE1/PENDING_STAGE2 |
| N5 | **Stale-request invalidation** — auto-INVALIDATED when item status changes | MEDIUM | Race condition fix |
| N6 | **Claim-on-transfer** — PENDING_CLAIM after dual-stage transfer approval for individual recipients | MEDIUM | Transfer → individual → PENDING_CLAIM → claim/refuse |
| N7 | **Loan claim handshake** — PENDING_CLAIM after loan approval, due date from claim timestamp | MEDIUM | Fix overdue clock accuracy |
| N8 | **Loan return handshake** — `POST /requests/:id/return-initiate` + `return-confirm` + `return-dispute` | MEDIUM | Borrower-initiated return; lender confirms condition |
| N9 | **Disposal reversal** — `POST /items/:id/reverse-disposal` | LOW | Property Officer only; writes CustodyEvent; returns to IN_STORE |
| N10 | **Head handover verification screen** — `REVERTED_UNVERIFIED` items pending new head's verification | MEDIUM | Structured handover, not silent reassignment |
| N11 | **Staff catalog browse** (Capability: view name/category/building/status only) | MEDIUM | CatalogPage exists; endpoint exists (`/catalog`) |
| N12 | **Department Head reports screen** | MEDIUM | Capability `REPORT_RUN_DEPARTMENT` defined; nav item + screen + scoped endpoint needed |
| N13 | **Invite resend/revoke** | LOW | T6 built without these; invite status list (sent/accepted/expired) |
| N14 | **Password reset flow** — `POST /auth/request-password-reset` + `POST /auth/reset-password` | MEDIUM | Anti-enumeration pattern; `tokenVersion` bump on success |
| N15 | **Three-way capability sync test** — backend/web/mobile capability lists match | MEDIUM | Automated test comparing all three |
| N16 | **Mobile CI workflow** | MEDIUM | No `.github/workflows/mobile.yaml` exists |
| N17 | **Buildings management screen** (frontend) | LOW | Backend CRUD exists; frontend nav row removed pending screen |
| N18 | **System Config screen** | LOW | `/admin/system` route exists; SystemStatusPage exists; extend |
| N19 | **Bulk CSV import** | LOW | `POST /imports` endpoint not built; Property Officer only |
| N20 | **APPROVAL_ESCALATION_DAYS job** — auto-escalate stale requests to SYSTEM_ADMIN | LOW | Currently only string hack in reviewNote |

---

## 10. FRONTEND ↔ BACKEND WIRING MAP

| Endpoint | Backend Status | Frontend Caller | Wired? |
|---|---|---|---|
| `GET /items` | DONE (scoped, auth required) | `ItemsBrowsePage` via `api/items.ts` | ✅ |
| `GET /items/:tagId` | DONE (scope-checked) | `ItemDetailPage` | ✅ |
| `GET /items/recent` | DONE (static route fix) | `RecentlyRegisteredItems` via `useItems` | ✅ |
| `GET /items/held-by-me` | DONE (static route fix) | `HeldItems` via `useItems` | ✅ |
| `POST /items` | DONE (PROPERTY_OFFICER only) | `ItemFormPage` | ✅ |
| `PUT /items/:id` | DONE | `ItemFormPage` | ✅ |
| `POST /items/:id/claim` | DONE (code) | — | ❌ No frontend screen yet |
| `POST /items/:id/void` | DONE (route added 15 Oct) | — | ❌ No frontend button |
| `POST /items/:id/accessories` | DONE | `ItemStaffPage` | ✅ |
| `GET /items/:id/history` | DONE | `ItemStaffPage` via `useAudits` | ✅ |
| `GET /items/:id/tag` | DONE | `TagPanel` | ✅ |
| `POST /items/:id/tag/regenerate` | DONE | `TagPanel` | ✅ |
| `GET /requests` | DONE | `RequestsListPage` | ✅ |
| `POST /requests` | DONE | `RequestFormPage` | ✅ |
| `GET /requests/:id` | DONE | `RequestDetailPage` | ✅ |
| `GET /requests/pending-count` | DONE | nav badge via `useRequests` | ✅ |
| `POST /requests/:id/approve` | DONE | `RequestDetailPage` | ✅ |
| `POST /requests/:id/reject` | DONE | `RequestDetailPage` | ✅ |
| `POST /requests/:id/withdraw` | BUILD | — | ❌ |
| `POST /requests/:id/return` | DONE (code) | — | ❌ No UI wired |
| `GET /audits` | DONE | `AuditListPage` via `useAudits` | ⚠️ BROKEN (tsc errors in dirty tree) |
| `POST /audits` | DONE | `AuditNewPage` | ⚠️ BROKEN |
| `POST /audits/:id/scan` | DONE | `AuditScanPage` | ⚠️ BROKEN |
| `POST /audits/:id/complete` | DONE | `AuditScanPage` | ⚠️ BROKEN |
| `GET /audits/:id` | DONE | `AuditReportPage` | ⚠️ BROKEN |
| `GET /audits/active` | DONE (static route fix) | `CurrentAuditProgress` | ✅ (after fix) |
| `GET /audits/findings` | DONE (static route fix) | `OpenFindings` | ✅ (after fix) |
| `GET /reports/inventory` | DONE | `ReportsPage` | ✅ |
| `GET /reports/audit/:id` | DONE | `AuditReportPage` | ✅ |
| `GET /reports/disposals` | DONE | `ReportsPage` | ✅ |
| `GET /notifications` | DONE | `NotificationsPage` | ✅ |
| `POST /notifications/:id/read` | DONE | `NotificationsPage` | ✅ |
| `DELETE /notifications` | DONE | `NotificationsPage` | ✅ |
| `POST /users/invite` | DONE (T6, needs migration) | `AdminUsersPage` | ✅ |
| `POST /auth/accept-invite` | DONE (T6) | `AcceptInvitePage` | ✅ |
| `GET /users/approvals` | DONE (legacy flow) | `AdminUsersPage` | ✅ |
| `POST /users/approvals/:id/approve` | DONE | `AdminUsersPage` | ✅ |
| `POST /users/approvals/:id/reject` | DONE | `AdminUsersPage` | ✅ |
| `POST /auth/account-requests` | DONE (no staffId, no email verify) | `RequestAccountPage` | ⚠️ PARTIAL |
| `POST /auth/verify-email` | BUILD | — | ❌ |
| `GET /departments` | DONE (public) | `RequestAccountPage` | ✅ |
| `GET /departments/invitable` | DONE (T6) | `AdminUsersPage` | ✅ |
| `GET /buildings` | DONE (officer-only) | — | ❌ No screen yet |
| `GET /system/status` | DONE | `SystemStatus` tile | ✅ |
| `GET /system/events` | DONE (AdminActionLog only) | `RecentSystemEvents` tile | ✅ |
| `GET /loans/overdue` | DONE | `OverdueLoans` tile | ✅ |
| `GET /departments/:id/roster` | DONE | `DepartmentRoster` tile | ✅ |
| `POST /uploads/photo` | DONE | `PhotoField` | ✅ |
| `GET /catalog` | DONE | `CatalogPage` | ✅ |

---

## 11. PER-ROLE UI SPECIFICATION

### SYSTEM_ADMIN
**What they see:** Account management only. Zero asset data.
- Dashboard: SystemStatus tile, RecentSystemEvents tile (AdminActionLog only)
- Nav: Dashboard, Accounts (with approval badge), System Status, Notifications
- Screen `/admin/users`: Account list, invite form, approval queue (pending staff + escalated)
- Screen `/admin/system`: System config, health, recent account events
- Never sees: items, requests, audits, reports

### PROPERTY_OFFICER
**What they see:** Everything asset-related, college-wide.
- Dashboard: RecentlyRegisteredItems, OverdueLoans tiles
- Nav: Dashboard, Scan a Tag, Browse Items, Requests (badge), New Item, Audit History, Reports, Notifications, Categories
- Key screens: Full item register, transfer/disposal approval, audit history + reports
- Can: Create items, edit identity + financial fields, void items, approve all requests, reverse disposals, manage buildings/categories

### DEPARTMENT_HEAD
**What they see:** Own department scope + personally held items.
- Dashboard: HeldItems summary, DepartmentRoster snapshot
- Nav: Dashboard, Browse Items (dept scope), Department Requests (badge), Accounts (badge), Notifications
- Screen `/admin/users`: Own-unit pending approval queue + staff deactivation
- Screen `/departments/:id`: Department detail + items
- Can: Approve department requests (stage1/stage2), approve own-unit staff registrations, deactivate own staff

### STAFF
**What they see:** Own items only.
- Dashboard: (standard)
- Nav: Dashboard, Browse Items (own scope), My Requests, Notifications, Catalog
- Can: File transfer/disposal/loan requests, claim assigned items, edit condition/notes of own items
- Cannot: Register, approve, run audits, see other people's items

### AUDITOR
**What they see:** Audit scope items + read-only.
- Dashboard: CurrentAuditProgress, OpenFindings, AuditHistoryQuickList tiles
- Nav: Dashboard, Active Audit, Audit History, Reports, Notifications
- Can: Run audit sessions (create/scan/complete), view all items (in audit scope), generate reports
- Cannot: Approve requests, edit items, manage accounts

---

## 12. SECURITY REQUIREMENTS (All Mandatory, Server-Side)

1. `GET /items` requires authentication — `authenticate` (hard-require), not `optionalAuthenticate` ✅
2. Item-by-id enforces same scope as list view — `itemInScope` runs before row is returned ✅
3. SYSTEM_ADMIN never receives asset data — `scopeToViewer` maps to `{ id: { in: [] } }` ✅ (verify live)
4. `/system/events` returns only `AdminActionLog` rows — no asset/audit activity ✅
5. Session invalidation on role change — `tokenVersion` bump on promote/password reset ✅
6. Optimistic locking on items — `version` column checked on every PUT ✅
7. DB-level uniqueness on PIN and audit result rows ✅
8. Rate limiting on login/auth endpoints ✅ (not verified live)
9. IDOR protection on notifications — `deleteMany` scoped by `userId` ✅
10. Public/unauthenticated responses never include `cost`, custodian identity, or exact room location ✅ (via `sanitizeItem`)
11. Out-of-scope access returns 404, not 403 ✅
12. No hard deletes — only status changes (accounts deactivation partially broken — B11)
13. Maker-checker on all approvals — requester cannot approve own request ✅

---

## 13. DEPLOYMENT ARCHITECTURE

### Vercel Projects
| Project | Root Dir | URL | Current Status |
|---|---|---|---|
| `cncs-pms-web` | `frontend/` | https://cncs-pms-web-hayredins-projects.vercel.app | Ready (but old revision) |
| `cncs-pms-api` | `backend/` | https://cncs-pms-api-hayredins-projects.vercel.app | **Deployment blocked** (path concat issue) |

### Environment Variables (Backend — `cncs-pms-api`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** endpoint (runtime) |
| `DIRECT_URL` | Neon **unpooled** endpoint (migrations only) |
| `JWT_SECRET` | Signs tokens — changing invalidates all sessions |
| `PUBLIC_BASE_URL` | **Frontend origin** — baked into every QR sticker at print time |
| `UPLOADS_DIR` | `/tmp/uploads` on Vercel (read-only filesystem except /tmp) |
| `NOTIFY_EMAIL` | `false` — email transport is a stub |
| `CLOUDINARY_CLOUD_NAME` + `_API_KEY` + `_API_SECRET` | Photo storage (omit all three → disable uploads) |
| `CORS_ORIGINS` | **Required in production** — comma-separated frontend origin(s) |

### Environment Variables (Frontend — `cncs-pms-web`)
| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Baked into browser bundle at build time |
| `API_BASE_URL` | Runtime for `api/preview.ts` social preview function |
| `VITE_SITE_ORIGIN` | Optional — for social preview absolute URLs |

### Deployment Blockers (Must Fix Before Deploying)
1. `_prisma_migrations` has FAILED row for `20261012000000_phase_a_expand` → `prisma migrate resolve --rolled-back 20261012000000_phase_a_expand`
2. Migration `20261014000000_account_invite_fields` not applied → `prisma migrate deploy`
3. Web build tsc errors (B3) must be fixed first
4. Backend Vercel project has path concatenation issue in settings → fix root directory in Vercel dashboard

### Vercel Gotchas
- `prisma generate` must be first step of build command (already fixed in `package.json`)
- Needs `outputDirectory: "public"` + empty `backend/public/` (already present)
- QR tag PNGs written to `UPLOADS_DIR=/tmp/uploads` (volatile — regenerated on demand)
- `PUBLIC_BASE_URL` baked into QR stickers — changing it breaks existing stickers with no CI warning

---

## 14. MASTER TODO LIST (Ordered by Priority)

### 🔴 BLOCKING — Fix Before Any New Feature Work

- [ ] **B3** Fix web build tsc errors (AuditScanPage.tsx:70,116,144 + AuditListPage.tsx:146 + useAudits.ts:190) — either finish the uncommitted restoration or revert `bd1cc65`
- [ ] **B1** Fix CI (follows B3 automatically once build is green)
- [ ] **B5** Run `prisma migrate resolve --rolled-back 20261012000000_phase_a_expand` on live DB
- [ ] **B6** Apply migration `20261014000000_account_invite_fields` to live DB
- [ ] **B2** Redeploy `phase-a-b-complete` to Vercel and prove correct revision (hit a route only on new branch)

### 🟠 HIGH PRIORITY — Core Functionality Broken

- [ ] **B7** Wire `resolveApprover` into the approve/reject/escalate handlers
- [ ] **B18** Fix Department Head's empty request queue
- [ ] **B12** Write `AdminActionLog` entries on every approval decision
- [ ] **B14** Replace `"[ESCALATED]"` string hack with real `escalatedAt`/`escalatedById` status
- [ ] **B11** Replace `DELETE /users/:id` with proper deactivation (N1)
- [ ] **N1** Build deactivation backend — `tokenVersion` bump, items → `REVERTED_UNVERIFIED`, log
- [ ] **B10** Fix mobile 6-role bug — delete `ACCOUNT_ADMIN` from `enums.dart`; add `ACCOUNT_*` capabilities

### 🟡 MEDIUM PRIORITY — Missing Core Features

- [ ] **N2** Build `POST /auth/verify-email` (T4 email verification flow)
- [ ] **B13** Add `staffId` field to registration + schema
- [ ] **N14** Build password reset flow (`request-password-reset` + `reset-password`)
- [ ] **N3** Build Department Head approval screen (proper queue with scope filter, not just admin/users)
- [ ] **N4** Build request withdrawal (`POST /requests/:id/withdraw`)
- [ ] **N6** Build claim-on-transfer for individual recipients
- [ ] **N7** Build loan claim handshake (PENDING_CLAIM after loan approval)
- [ ] **N8** Build loan return handshake (`return-initiate` + `return-confirm` + `return-dispute`)
- [ ] **N5** Build stale-request auto-invalidation when item status changes
- [ ] **N10** Build head handover verification screen (REVERTED_UNVERIFIED items for new head)
- [ ] **N15** Build three-way capability sync test (backend/web/mobile)
- [ ] **N16** Create mobile CI workflow
- [ ] **B17** Fix building management screen (backend CRUD exists, frontend nav row removed — re-add with screen)

### 🟢 LOW PRIORITY — Polish + Future Features

- [ ] **N9** Build disposal reversal (`POST /items/:id/reverse-disposal`)
- [ ] **N12** Build Department Head reports screen
- [ ] **N13** Build invite resend/revoke + status list
- [ ] **N17** Build buildings management screen (frontend)
- [ ] **N18** Extend System Config screen
- [ ] **N19** Build bulk CSV import
- [ ] **N20** Build APPROVAL_ESCALATION_DAYS scheduled job
- [ ] **B9** Remove `ownerId` from API responses (contract slice)
- [ ] **B15** Finish `isDisposal`/`isLoan`/`isStage2` incomplete branches in `requestWorkflow.ts`
- [ ] **B16** Fix social preview (public item endpoint needed or preview must use auth)
- [ ] **B8** Verify SYSTEM_ADMIN request scope is empty in production
- [ ] Fix polling interval (currently 60s health check; should be 30s for notifications)
- [ ] Add `REPORT_RUN_DEPARTMENT` capability scoped reports for Department Head
- [ ] Ethiopian calendar display (currently UTC/Gregorian — locale adaptation needed long-term)
- [ ] PDF export improvements
- [ ] Real SMTP email (Resend integration — DNS/domain access required)
- [ ] MFA for SYSTEM_ADMIN and PROPERTY_OFFICER

---

## 15. LIVE VERIFICATION TABLE (Run These After Each Fix)

| # | Scenario | Expected |
|---|---|---|
| 1 | Biology applicant registers + verifies email | Appears only in Biology head's queue |
| 2 | CS head approves Biology request ID | **404**, status unchanged |
| 3 | CS head lists approvals | CS requests only |
| 4 | Biology head approves | ACTIVE, unit=Biology, role=STAFF, AdminActionLog row |
| 5 | Registration body has `role: "SYSTEM_ADMIN"` | Ignored; created as STAFF |
| 6 | Register to Physics (no head) | Visible only to SYSTEM_ADMIN |
| 7 | CS head clicks "Not in my department" | Leaves head queue; SYSTEM_ADMIN sees it |
| 8 | Pending user signs in | No session; pending message shown |
| 9 | Rejected user signs in | Rejection reason shown |
| 10 | STAFF calls any approvals endpoint | 404 |
| 11 | SYSTEM_ADMIN invites head without `authorizationRef` | 400, nothing created |
| 12 | SYSTEM_ADMIN invites head with valid authorization | Invite created, AdminActionLog has `authorizedBy` + ref |
| 13 | Invite second head for unit that has one | 400 |
| 14 | Invite same person as Property Officer + Auditor | 409 |
| 15 | SYSTEM_ADMIN approves own account | Rejected |
| 16 | Head deactivates staff; old token reused | 401; items become `REVERTED_UNVERIFIED` |
| 17 | Head tries to deactivate another head | 404/403, no change |
| 18 | Request pending > threshold days | SYSTEM_ADMIN notified and can decide |
| 19 | Invitee opens expired/used link | Clean error, no account change |
| 20 | Click every nav item for all 5 roles | No "Page not found" |

---

## 16. SCHEMA DESIGN DECISIONS (Don't Re-Open Without Strong Reason)

| Decision | Rationale |
|---|---|
| 5 roles (merged ACCOUNT_ADMIN into SYSTEM_ADMIN) | Decided 12 Oct — migration applied and 460 tests built on it |
| Staff self-registration approved by unit head (not SYSTEM_ADMIN) | D1 — decided and final per authority doc |
| No self-registration for privileged roles | D2 — SYSTEM_ADMIN invites only |
| Holder model (holderType/holderId) over ownerId | ownerId is legacy; holder model is the truth |
| Disposal = single approver (Property Officer) | SRS leaves two-approver threshold open; deferred |
| No public item routes | Removed — all item reads require auth |
| `POST /auth/register` removed | Replaced by invite flow — no admin ever sets a password |
| Audit scope snapshot on freeze (PENDING rows) | Items in scope at session start get PENDING rows; completion computes vs. those rows |
| Append-only logs (AdminActionLog, CustodyEvent, ItemEditLog) | Never UPDATE or DELETE these tables |
| JWT 1-day expiry, no refresh | Accepted limitation — mitigated by `tokenVersion` bump on credential change |
| QR tag URL = `${PUBLIC_BASE_URL}/item/:tagId` | Baked at print time — changing PUBLIC_BASE_URL breaks existing stickers |

---

## 17. CODE CONVENTIONS

### Backend
- Every route handler uses `requireCapability()` or `requireRole()` — never branch on role names in routes
- Field filtering done via `sanitizeItem()` in `utils/filterItemFields.ts` — never in client
- All state-changing routes write to the relevant append-only log in the same transaction
- `HttpError` class for predictable error shapes — throw with status + message
- `validate(schema)` middleware for request body validation (zod)
- Dual-mount pattern: `app.use(["/api/v1/X", "/X"], router)` for all routers

### Frontend
- API calls go through `apiClient.ts` — never bare `fetch` (ensures token attachment + error normalization)
- `lib/permissions.ts` for render decisions — server still enforces, this is UI only
- `ASSET_ROLES` constant for "everyone except SYSTEM_ADMIN" checks
- Route guards use `<RequireAuth roles={[...]}>` — `*` route renders 404 for wrong roles (no separate 403 page)
- Every mutation invalidates TanStack Query caches and shows a toast
- Never render privileged fields the server didn't send — their absence IS the access control
- Dates are UTC; label as such in all date range inputs
- Photos are URLs (not uploads until `POST /uploads/photo` is called) — `PhotoField` handles all three sources (camera, file, URL)

### Mobile
- `apiClient` in `lib/core/api/` — all calls through it
- `lib/models/permissions.dart` for capability checks — must mirror backend exactly
- `lib/app/router.dart` uses GoRouter
- Test fixtures in `test/support/fixtures.dart`

---

## 18. OPEN QUESTIONS FOR SUPERVISOR/TEAM

1. Confirm **D1**: heads approve own-unit staff registrations; SYSTEM_ADMIN is fallback for vacant head/stale requests.
2. `APPROVAL_ESCALATION_DAYS` value — using 5 as working default.
3. Which exact office authorizes heads, Property Officers, and Auditors (for invite form's "Authorized by" field).
4. Whether staff may self-register into a headless unit (Physics) or must wait for a head invite.
5. Accepted AAU email domains for registration validation.
6. Resend domain and DNS access for real email delivery.
7. Finance/statutory: does CNCS report asset values upward (IFMIS)? Depreciation rule?
8. Disposal second approver / value threshold (currently single Property Officer approval).
9. Ethiopian calendar display requirement (currently UTC/Gregorian).
10. Log retention period (for `AdminActionLog`, `CustodyEvent`, `ItemEditLog`).

---

## 19. SEED DATA REFERENCE

After running `cd backend && pnpm prisma:seed`:

| Role | Email | Password |
|---|---|---|
| SYSTEM_ADMIN | `sysadmin@cncs.aau.edu.et` | `Admin123!` |
| SYSTEM_ADMIN | `sysadmin2@cncs.aau.edu.et` | `Admin123!` |
| PROPERTY_OFFICER | `officer@cncs.aau.edu.et` | `Officer123!` |
| DEPARTMENT_HEAD (CS) | `head.cs@cncs.aau.edu.et` | `Head123!` |
| DEPARTMENT_HEAD (Bio) | `head.bio@cncs.aau.edu.et` | `Head123!` |
| DEPARTMENT_HEAD (Chem) | `head.chem@cncs.aau.edu.et` | `Head123!` |
| STAFF (CS1) | `staff.cs1@cncs.aau.edu.et` | `Staff123!` |
| STAFF (CS2) | `staff.cs2@cncs.aau.edu.et` | `Staff123!` |
| AUDITOR | `auditor@cncs.aau.edu.et` | `Auditor123!` |
| PENDING (CS) | `pending.cs@cncs.aau.edu.et` | `Pending123!` |
| PENDING (Bio) | `pending.bio@cncs.aau.edu.et` | `Pending123!` |
| PENDING (Physics) | `pending.phys@cncs.aau.edu.et` | `Pending123!` |

**Departments:** Computer Science (has head), Biology (has head), Chemistry (has head), Physics (**no head** — tests fallback)

**Demo items:** CNCS-DEMO-0001 (laptop), CNCS-DEMO-0002 (desk), CNCS-DEMO-0003 (microscope), CNCS-DEMO-0004 (charger, accessory of laptop)

Seed is **idempotent** — re-running resets demo data to known state without wiping ItemEditLog history.

---

## 20. WORKFLOW COMPLETENESS GAPS (From `docs/workflow-completeness-spec.md`)

The following handshakes are specified but not yet fully built:

| Action | INITIATE | APPROVE | CONFIRM/CLAIM | Status |
|---|---|---|---|---|
| Registration | Property Officer | — | Assigned holder | ✅ DONE (claim endpoint exists, not fully wired) |
| Transfer → individual | Requester | Stage1 + Stage2 heads | Recipient | ❌ No PENDING_CLAIM after approval |
| Transfer → department | Requester | Stage1 + Stage2 heads | — (head's approval IS acceptance) | ⚠️ PARTIAL |
| Loan start | Borrower | Approving head | Borrower (claim) | ❌ Directly LOANED on approval |
| Loan return | Borrower (initiate) | — | Lender (confirm) | ❌ Only `returnLoan` function exists |
| Disposal | Officer/Head | Property Officer | — (terminal) | ✅ DONE |
| Handover | SYSTEM_ADMIN (activates) | — | New head per item | ⚠️ REVERTED_UNVERIFIED set; no verification screen |
| Account request | Applicant | Unit head / SYSTEM_ADMIN | — (activation IS confirmation) | ✅ DONE |
| Privileged invite | SYSTEM_ADMIN | — (authorizationRef IS approval record) | Invitee (accept-invite) | ✅ DONE (needs migration) |

---

## 21. DEFINITION OF DONE (For This Project)

A feature or fix is **done** when ALL of the following are true:
1. Backend endpoint exists and returns the correct response for the happy path AND all error cases
2. Frontend page/component exists and calls the endpoint through `apiClient`
3. Tests exist (backend unit/route + frontend RTL + MSW)
4. CI is green (lint + tsc + tests pass)
5. The row in §10's wiring map says "✅"
6. The row in §14's TODO list is checked off
7. For account/security features: verified live with real HTTP calls and responses pasted

---

*End of Master Knowledge Base — 2026-10-20*
