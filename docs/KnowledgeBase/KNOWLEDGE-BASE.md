# CNCS PMS — Unified Knowledge Base

**Last revised:** 20 Oct 2026 · **Maintainer:** write updates into this file only — do NOT re-open archived specs.
**Verification basis:** full audit 20 Oct: all docs read, backend (460→531 tests, mocked-Prisma vitest), frontend build/browser behavior, Flutter app, live Vercel behavior from deployment history. Every `[DONE]`/`[BROKEN]` claim in this file reflects the **code as it stands on `Hayredin950/main` @ `9bda386`**, not a doc.

**Supersedes (where conflicts existed, rulings recorded here):**
`monolithic-system-design.md` (few stale line numbers/statuses superseded by audit), `workflow-completeness-spec.md` (§6.2 nuovo spec), `docs/README.md` (active-set table), and all archive docs.

---

## 1. Project identity

| Field | Value |
|---|---|
| Institution | Addis Ababa University, College of Natural and Computational Sciences (CNCS) |
| Scope phase 1 | One campus, one college, 4 departments (CS, Biology, Chemistry, Physics); University/National tiers deferred |
| Repos | `yanetgeleta/cncs_property_management_system` (origin, protected `main`, needs PR)** · **`Hayredin950/cncs_property_management_system`** (personal, **deploy source for Vercel production**) |
| Branches (canonical) | `main` (personal — current, verified) · `lalu-branch` (Yanet's work — needs reconciliation) · `feat/workflow-completeness-spec` (merged to personal/main) |
| Deploy | **Two Vercel projects** — `cncs-pms-web` (static Vite), `cncs-pms-api` (one serverless fn exporting Express); Neon `CNCS PMS` Postgres (pooled DB + unpooled DIRECT_URL); Cloudinary for photos |
| Docs authority | **This file.** Anything in `docs/archive/` is history only, effective 20 Oct |

> Branch consolidation: the branch gulf in Yanet's repo and stale-branch archiving (list in `monolithic-system-design.md` §11.0) still stands as an open sys-admin task — archive-checked before any new work begins.

---

## 2. Ground rules (standing, from authority doc + audit)

1. **Nothing is "done" until verified live** — real HTTP response pasted, click-through of the actual screen. A passing unit test against a mocked Prisma layer does NOT prove a runtime path works.

2. **Server decides every permission.** Never trust `role`, `unitId`, `approverId`, or `authorizedBy` from a client; re-read the actor + target from DB before a state-changing action.

3. **Out-of-scope access → 404, not 403** (no existence leak). `user.canDecide` returns false ⇒ 404.

4. **Every state change leaves an append-only trail:** accounts → `AdminActionLog`, items → `CustodyEvent`, audits → `AuditItemResultRow`.

5. **Endpoint + frontend caller + test ship together.** An endpoint without a "Wired=Yes" word in this file isn't [DONE] (see §12).

6. **Soft non-deletion:** delete-shaped actions become status changes (`VOIDED` items, `DEACTIVATED` accounts); no row removal in the app; FK will protect trails breaking on hard-delete.

7. **Anti-"silent zero" rule:** no UI lies with a confident empty/error state; failures render `OfflineState`/`ErrorState`, not `[]`.

---

## 3. Role model — FINAL (5 roles)

```
SYSTEM_ADMIN     — account administration ONLY. Zero asset data, zero asset approvals. Sees no Items, no Requests
PROPERTY_OFFICER — college-wide operational authority. Registers items, approves transfers/disposals/loans,
                   claims on behalf of college pool, runs audits w/ role-level views, manages buildings/categories
DEPARTMENT_HEAD  — department-scoped. Approves own-unit staff self-registrations + own-dept transfer/disposal/loan
                   requests either stage (release or receive). Can personally hold items. Reports per department
STAFF            — self-scoped custodian. Files transfer/disposal requests from the UI (loan filing disabled
                   until intake fixed, see §13), claims custody, confirms/refuses claims. NEVER registers, edits, or approves
AUDITOR          — read-only asset role. Runs and completes audit sessions, reviews findings, exports evidence
```

> The old `ACCOUNT_ADMIN` merged into SYSTEM_ADMIN on 12 Oct — survives only as a 2-line stale reference left in Flutter `mobile/lib/widgets/status_badges.dart:160,169`. Clean these up before anything else on mobile. Web/backend 5-role only.

### 3.1 Capability matrix (canonical, from `backend/src/services/permissions.ts`)

(Complete original complete-table matrix lives at `backend-audit-2026-10-20.md` §5; extracted here for AI-agent guidance — authoritative.)

| Capability | SYSTEM_ADMIN | PROPERTY_OFFICER | DEPARTMENT_HEAD | STAFF | AUDITOR |
|---|---|---|---|---|---|
| `ITEM_CREATE` | — | ✔ | — | — | — |
| `ITEM_EDIT_IDENTITY` | — | ✔ | — | — | — |
| `ITEM_EDIT_CUSTODY` | — | ✔ | ✔ (own dept only) | ✔ (self-held only) | — |
| `ITEM_CLAIM` | — | ✔ | ✔ | ✔ | — |
| `ITEM_VOID` | — | ✔ | — | — | — |
| `ITEM_READ_ALL` | **—** | ✔ | — | — | ✔ |
| `DISPOSAL_REVERSE` | — | ✔ | — | — | — |
| `BUILDING_MANAGE` | — | ✔ | — | — | — |
| `TAG_MANAGE` | — | ✔ | — | — | — |
| `CATEGORY_MANAGE` | — | ✔ | — | — | — |
| `AUDIT_RUN` | — | — | — | — | ✔ |
| `AUDIT_VIEW` | — | ✔ | — | — | ✔ |
| `REQUEST_DECIDE` | — | ✔ | ✔ (own-dept either stage) | — | — |
| `TRANSFER_APPROVE_STAGE1` (release) | — | ✔ | ✔ (own unit) | — | — |
| `TRANSFER_APPROVE_STAGE2` (receive) | — | ✔ | ✔ (own unit) | — | — |
| `DISPOSAL_APPROVE` | — | ✔ | — | — | — |
| `LOAN_APPROVE` | — | ✔ | — | — | — |
| `REQUEST_READ_ALL` | — | ✔ | — | — | — |
| `REPORT_VIEW_ALL` | — | ✔ | ✔ (dept scope via REPORT_RUN_DEPARTMENT) | — | ✔ |
| `ACCOUNT_MANAGE` | ✔ | — | — | — | — |
| `ACCOUNT_APPROVE_OWN_UNIT` | — | — | ✔ | — | — |
| `ACCOUNT_APPROVE_ANY` | ✔ | — | — | — | — |
| `ACCOUNT_INVITE` | ✔ | — | — | — | — |
| `ACCOUNT_DEACTIVATE_OWN_UNIT` | — | — | ✔ | — | — |
| `ACCOUNT_DEACTIVATE_PRIVILEGED` | ✔ | — | — | — | — |
| `SYSTEM_CONFIG` | ✔ | — | — | — | — |
| `USER_READ` | ✔ | ✔ | — | — | — |

**Rulings:**
- SYSTEM_ADMIN deliberately holds **no** `ITEM_READ_ALL` / `AUDIT_VIEW` / asset-scoped caps.
- `DISPOSAL_REVERSE` is a NEW capability introduced by workflow-completeness-spec §4.3 — held by PROPERTY_OFFICER only.
- Capability = "may do" (route gate); **per-request scope** = "which" — decided per-row through `canDecide(actor, request)` or `itemInScope(actor, item)` per *scope rules in §9*.
- **Three-way capability sync test** (backend ↔ web ↔ mobile) is a standing TODO (see Backlog P0).

### 3.2 Approval authority (the D1 decision, FINAL — no re-opening)

| Account type | Created how | Who decides | Outside-system authority | Fallback |
|---|---|---|---|---|
| STAFF | Self-registers (`POST /auth/account-requests`) | Active head of the applicant's chosen unit | Head knows the person | Head → parent's head → SYSTEM_ADMIN |
| DEPARTMENT_HEAD | SYSTEM_ADMIN invite bound to one unit | SYSTEM_ADMIN executes | College office/administration | Second SYSTEM_ADMIN if actor is invitee |
| PROPERTY_OFFICER | SYSTEM_ADMIN invite | SYSTEM_ADMIN executes | Property office/administration | Same |
| AUDITOR | SYSTEM_ADMIN invite | SYSTEM_ADMIN executes | Office of Auditors | Same |
| SYSTEM_ADMIN | Seeded or invited by another SYSTEM_ADMIN | A different SYSTEM_ADMIN | IT/administration | None — target ≥2 SYSTEM_ADMINs before launch |

**Invariants:** requester/invitee never decides own account · head decides only own-unit-or-children · nobody both PROPERTY_OFFICER and AUDITOR · ≤1 active head per unit · self-deactivation disallowed in every role · role change bumps `tokenVersion` (JWT revocation) · `canDecide` is the entry gate for ALL approve/reject/escalate paths.

**Privileged invites:** never self-registered. Every invite records `authorizedBy` + `authorizationRef` (the letter/person who authorized outside the system). Recorded in `AdminActionLog`. Invitee sets their own password via single-use hashed `EmailToken(72h)` — no admin ever sees or sets a password.

---

## 4. Canonical entity & DB schema

Full audit-table with all fields lives in `backend-audit-2026-10-20.md` §1 (refer to it for individual fields). Condensed contract:

```
Role enum             SYSTEM_ADMIN | PROPERTY_OFFICER | DEPARTMENT_HEAD | STAFF | AUDITOR
AccountStatus         ACTIVE | PENDING_EMAIL_VERIFICATION | PENDING_APPROVAL | REJECTED | DEACTIVATED
AccountRequestStatus  PENDING_APPROVAL | APPROVED | REJECTED | ESCALATED
HolderType            STAFF | DEPARTMENT | COLLEGE (Property Office pool; holderId null)
ItemStatus            PENDING_CLAIM | ACTIVE | REVERTED_UNVERIFIED | LOANED | LOST | DISPOSED | VOIDED
RequestType           TRANSFER | DISPOSAL | LOAN
RequestStatus (9)     PENDING | PENDING_STAGE1 | PENDING_STAGE2 | APPROVED | REJECTED |
                      WAITLISTED | WITHDRAWN | INVALIDATED | RETURN_PENDING_CONFIRMATION
AuditItemResult       PENDING | FOUND | MISSING | LOCATION_MISMATCH | DAMAGED
CustodyEventType (15) CREATED | CLAIMED | CLAIMED_WITH_CORRECTION | CLAIM_REFUSED | CLAIM_EXPIRED |
                      REVERTED | TRANSFERRED | DISPOSED | DISPOSAL_REVERSED | LOST | RECOVERED |
                      VOIDED | LOCATION_CHANGED | VERIFIED | HOLDER_DEACTIVATED | EDITED
Condition             NEW | GOOD | FAIR | DAMAGED | BEYOND_REPAIR
```

### 4.1 Models (summary of the loaded contract)

| Model | Core relationship | Key fields |
|---|---|---|
| `User` | `orgUnitRef → OrgUnit` | `role`, `accountStatus`, `staffId? @unique`, `tokenVersion`, `mustChangePassword` (legacy only, still selected at login — flag in backlog), review/escalation fields, `headedOrgUnit` inverse |
| `AccountRequest` | `userId → User @unique` | `requestedUnitId` / `confirmedUnitId` (SYSTEM_ADMIN-only override), whole `AccountRequestStatus` lift, authorization fields for privileged invites |
| `OrgUnit` | self `parentId`, `tier` | `name`, `code`, `isActive`, `acceptsSelfReg`, `headId @unique?` (one active head, nullable = vacant) |
| `Item` | `categoryId`, `orgUnitId?`, `buildingId?`, `floor`/`room`, `parentItemId? → accessories` | `tagId @unique`, `pin? @unique` (lifetime, never reused), `name`, `holderType/holderId`, **`ownerId` legacy (still required AND being written — dual-write window)**, `purchaseCost Decimal`, condition/brand/serial, `photoUrl`, claim transaction (`claimedAt`,`claimDueAt`), verification (`lastVerifiedAt/ById`), void (`voidReason`,`voidedAt`,`voidedById`), **`version Int @default(0)` optimistic lock** |
| `CustodyEvent` (append-only) | `itemId` | `eventType` from the 15-set, `fromHolderType/Id → toHolderType/Id`, `actingUserId`, `reason?, departmentHeadSnapshot?` — enforcing "who was responsible head at that moment" for handover authority (spec 4.9.4) |
| `Request` | `itemId`, `requestedById`, `reviewedById?` | `reason` (required), `rejectionReason?`, destination (`newLocationBuilding/Floor/Room?`, `newOwnerId?`, new-style `fromHolderType/Id → toHolderType/Id`), **two-stage approval trail** (`stage1ApprovedById/at`,`stage2ApprovedById/at`), loan fields (`loanDueDate`,`loanReturnedAt/ById`), `withdrawnAt/ById`, `invalidatedAt/reason` |
| `ItemEditLog` | `itemId` | One row per changed field (`fieldChanged`,`oldValue`,`newValue`), `editedAt` is the correlation key (deliberate; no `requestId` column) |
| `AuditSession` | — | `sessionType` (4 values), `reportNumber @unique?` (frozen-report serial), `scopeType/scopeValue?`, `runById`, `startedAt @default(now())`, `completedAt?`, `graceEndsAt?` |
| `AuditItemResultRow` | `auditSessionId` | `result @default(PENDING)`, `scannedAt`, `@@unique([auditSessionId,itemId])` (prevents double-counting) |
| `Notification` | `userId` | Minimal: `message` (+ `[CODE] ` prefix used to represent `type` — decision D3, documented), `relatedRequestId?`, `isRead` |
| `EmailToken` | `userId` | `type` (`VERIFY`/`INVITE`/`RESET`), `tokenHash` (SHA-256, never raw), `expiresAt`, `usedAt` |
| `AdminActionLog` (append-only) | `actorId`,`targetUserId?` | `action`,`unitId?`,`before/after Json?`,`authorizedBy?/authorizationRef?` (copied from invite payload) |

### 4.2 **Schema/migration drift (blocking, fix first)**

- `20261012000000_phase_a_expand` adds `User.departmentId`/`Item.departmentId` FKs to a `"Department"` model that **does not exist in the current schema** (OrgUnit replacement).
- `20261012020000_backfill_holder_fields` documents drops that happened outside `migrations/` (free-text `Item.department/User.department`), while `Item.ownerId` still live.
- `AccountRequest`, `EmailToken`, `AdminActionLog` exist in the live DB but **no migration on disk creates them** (created via `prisma db push`).
- **FAILED row for `20261012000000_phase_a_expand` + applied row** = PR `P3009` blocker until `prisma migrate resolve --rolled-back 20261012000000_phase_a_expand` (NOT `prisma migrate resolve --applied ...` — see backend-audit-2026-10-20.md §1.3, NOT DB row surgery) is resolved.
- Migration `20261014000000_account_invite_fields` (7 invite columns on `AccountRequest` + 2 on `AdminActionLog`) is on disk but **never applied** to the live DB.
- **No model carries `updatedAt`** → every `Item.updatedAt` filter in `services/expiry.ts`, `services/expiryEscalation.ts`, `routes/expiry.ts:71` is a guaranteed runtime 500. Add `updatedAt @updatedAt` to `Item` AND `Request` (Prisma-managed) in the same migration.

**Ruling on the drift:** run FROM-CURRENT-DB migration consolidation in the same slice — one expand migration that materializes `AccountRequest/EmailToken/AdminActionLog` as real migrations, re-apply via `migrate deploy` against fresh copy in staging first.

---

## 5. State machines (canonical — code reflects schema; docs to mirror this file)

### 5.1 Item lifecycle

```
              REGISTER (PO)             CLAIM (holder or head-on-behalf)
   (PO) ──────────────► PENDING_CLAIM ──────────────► ACTIVE
                              │ refuse-claim(reason) ──► back to COLLEGE pool; custody CLAIM_REFUSED; both dept-heads notified
                              │ expiry(> CLAIM_WINDOW_DAYS) ──► COLLEGE pool; custody CLAIM_EXPIRED; PO notified
                              │ void/dispose/other status change away ──► (requests invalidated §5.3; claim handshake invalidated §8.2)
                              ▼
ACTIVE ─┬─ verify-confirm (same-dept head / PO) ───► custody VERIFIED (lastVerifiedAt set)
        ├─ verify-flag — same mechanism as audit MISSING (confirmed-LOST or recheck path)
        ├─ TRANSFER stage-2 APPROVED ──► holder moves immediately (item status stays ACTIVE if TRANSFER_TO_DEPARTMENT
        │                                  — head's stage-2 approval IS departmental acceptance; NO claim step)
        │     but if TRANSFER_TO_INDIVIDUAL holder moves → IMMEDIATELY → PENDING_CLAIM (claim handshake §5.1)
        ├─ LOAN stage APPROVED ──► holder = borrower → PENDING_CLAIM ──claim──► LOANED (loanDueDate set FROM CLAIM time)
        │                          claim expiry ──► loan auto-cancelled, item back to pre-loan holder; approver notified
        ├─ DISPOSAL stage APPROVED ──► DISPOSED`(terminal)`
        │     └─ reverse-disposal(PO) ──► active custody RE-REGISTERED together with PO; NOT to old holder
        ├─ void (PO) ──► VOIDED`(terminal)`
        ├─ LOANED ──return-initiate(borrower)──► RETURN_PENDING_CONFIRMATION(BORROWER keeps Physical Custody)
        │     ├─ return-confirm(lender/PO) ──► ACTIVE (custody `TRANSFERRED`; custody transferwia written back)
        │     └─ return-dispute(lender/PO) ──► stays LOANED; dispute recorded → escalates to Property Officer
        │        (po return-confirm expiry) — same CLAIM_WINDOW_DAYS framework as handshake
        ├─ deactivation(head's or role change) ──► REVERTED_UNVERIFIED (custody REVERTED)
        │     └─ verify-confirm (new head) ──► ACTIVE; verify-flag — audit-MISSING path
        └─ audit completion: MISSING+grace expiry ──► LOST (custody LOST)
```

**No such status names exist:** `REGISTERED`, `ASSIGNED`, `IN_USE`, `IN_STORE`, `UNDER_REPAIR` — **do not exist** as enum values. Any doc machine using them (old monolithic §4.2) is superseded by this table.

### 5.2 Request states & handshakes (the INITIATE → APPROVE → CONFIRM pattern applied everywhere)

```
Requester files ──► PENDING
   ├ approve (disposal, loan stage) ──► decision applied ──► APPROVED (final)
   ├ approve (transfer stage-1) ──► PENDING_STAGE1 — stage1ApprovedById/at
   │      └ approve (stage-2) ──► PENDING_STAGE2 — stage2ApprovedById/at
   │             └ approve (stage-2) ──► APPROVED (final) + item mutation for stage transitions
   ├ reject (either stage) ── ► REJECTED (reason 3–500 chars captured in reviewNote/rejectionReason)
   ├ withdraw ── requester only, only pre-approval (per spec §1.3, logged; once a stage is approved, the approver should reject instead so approvals stay on record)
   ├ invalidated ── item status changes outside the request (voided / disposed / another request slipped in) ──► INVALIDATED + notify requester
   └ waitlisted ── competing request on same item granted first ──► WAITLISTED with reason; first one granted
```

- A2 — **One PENDING-family request per item** at a time (409 on second; the request already filed → WAITLISTED with public reason, never silent per-spec §1.4 + monolithic D5).
- The item mutation for stage 2 (receiving-head-after-stage-1.2 approval) — both heads must approve same destination holder AND custody happens exactly once (maker-checker: **initiator cannot approve**, stage-1 heading agency stays separate from stage-2 approval).
- STAFF-held items can file TRANSFER / DISPOSAL. Loan request intake is currently broken (no LOAN in `REQUEST_TYPES` — see §13 bug list).

### 5.3 Account/Registration handshakes (per spec §12 wait)

- **Self-registration (STAFF):** initiate → PENDING_APPROVAL → active-head decides · 404 if requester-like(actor) not in the scope · outside-scope-approver click never reads the row (fail-closed).
- **Privileged invite:** SYSTEM_ADMIN issues (role + unit + `authorizedBy` + `authorizationRef`, all required, all validated) → invitee opens link → accepts with password → `ACTIVE` (recorded `INVITE_ACCEPTED` in AdminActionLog).
- Account never may approve itself; role user-chosable defaults to STAFF; bump `tokenVersion` at approve `"decided"`.

### 5.4 Audit lifecycle

```
PO/AUDITOR opens a session(scope=DEPARTMENT OR BUILDING)
  ⇒ PO writes one AuditItemResultRow per in-scope item as PENDING (freeze the seen list)
  ⇒ scans write FOUND+scannedAt only (PO/auditor can never directly submit a different resultValue — only scan)
  ⇒ complete(sessionId) → (in one txn):
       PENDING without scan carry over as MISSING / LOCATION_MISMATCH / DAMAGED
       MISSING+grace-window (graceEndsAt) before LOST escalation
       sets completedAt, reportNumber (serial), read-ONLY, timestamps frozen.
```

- Physics always has `acceptsSelfReg` but no active head (by design, tests the vacant-head fallback). Only SYSTEM_ADMIN sees headless-unit requests in the queue.

---

## 6. Full API surface (live inventory read from code — mirrored from `backend-audit-2026-10-20.md` §2, trimmed to current line numbers)

Dual-mount note: every router is mounted at BOTH `/api/v1/<name>` AND `/<name>` (app.ts), and the auth endpoints are further double-registered internally (`/auth/login` AND `/login`). Canonical for frontends: **`/api/v1/<name>`** only. Keep the dual mounts until both frontends use `/api/v1` exclusively; DON'T let stale path replaces leak into docs.

### 6.1 Wiring map — status per §12 (an endpoint is [DONE] ONLY when its word is Wired=Yes)

| Endpoint | Status | Caller (web) | Caller (mobile) | Wired? | Notes |
|---|---|---|---|---|---|
| `POST /auth/login` rate-limited | [DONE] | LoginPage | login screen | Yes | email‑or‑ID identifier (`email` case-insensitive); refusal gate runs after password check (never leak-pending-accounts) |
| `GET /auth/me` | [DONE] | fetchCurrentUser | me | Yes | profile replay post-login |
| `POST /auth/change-password` | [DONE] | ChangePasswordPage | change-password | Yes | bumps `tokenVersion` (multi-session kill) |
| `POST /auth/account-requests` self-registration | [BROKEN] | RequestAccountPage | request-account | **Partial** | server intake is broken (`User.department` write — §13); no `staffId`, no `PENDING_EMAIL_VERIFICATION`, no duplicate-email opacity (see Backlog B03/B09) |
| `POST /auth/accept-invite` | [DONE] | AcceptInvitePage | **no mobile screen** | Partial | 72 h hashed token |
| `GET /items` role-scoped list | [DONE] | ItemsBrowsePage | ItemsListPage | Yes | `authenticate` hard-required (no anonymous fallback); web still routes `/items` through a public shell for anonymous visitors — unresolved redirect/content decision (see §12) |
| `GET /items/:tagId` scope-enforced | [DONE] | ItemDetailPage | ItemDetailPage | Yes | disposed ⇒ 410; scope to-viewer |
| `GET /items/:id` scope-enforced | [DONE] | ItemStaffPage | — | Yes | — |
| `GET /items/recent` | [DONE] | RecentlyRegisteredItems widget | no widget | Yes | route-order fix captures `/recent` ABOVE `/:tagId` pattern |
| `GET /items/held-by-me` | [DONE] | HeldItems widget | no widget | Yes | includes DEPARTMENT-held items for DEPARTMENT_HEAD |
| `POST /items` | [DONE] | ItemFormPage(create) | items new | Yes | PO only; write `holderType/holderId/ownerId` dual |
| `PUT /items/:id` optimistic lock | [DONE] | ItemFormPage(edit) | edit | Yes | edit seeds from `GET /items/:id`; write `version` compare-and-swap |
| `POST /items/:id/photo` | [DONE] | PhotoField | photo | Yes | Cloudinary `public_id = tagId` overwrite |
| `POST /items/:id/claim` | [DONE] | item detail disclosure | claim | **Partial** | code-in-place (route tests mock only), **no e2e flow-verify yet always** |
| `POST /items/:id/refuse-claim` | [DONE] | same | refuse | **Partial** | reasons set: `NEVER_RECEIVED`,`WRONG_ITEM`,`CONDITION_MISMATCH`,`OTHER` |
| `POST /items/:id/claim-with-correction` | [CODE] code only | no web caller / no mobile | no | **No UI yet** | wire into claim detail disclosure |
| `POST /items/:id/verify-confirm` + `verify-flag` | [CODE] code only | no caller | no | **No UI yet** | needed for `REVERTED_UNVERIFIED` handover verification |
| `POST /items/:id/reverse-disposal` | [CODE] code only | no caller | no | **No UI yet** | post-dispose correction path |
| `POST /items/:id/void` | [DONE per backend-audit-2026-10-20.md §2.2a] | ItemStaffPage (TagRegenerateSection) | delete | **Partial** | endpoint + page + but no flow-e2e for the decline path |
| `GET /requests` window filter(s) | [DONE] | RequestsListPage | RequestsListPage | Yes | `this-week/this-month/last-30-days/custom` URL-synced; fixed |
| `GET /requests/pending-count` | [DONE] | badge | badge | Yes | `/requests/pending` deliberate 404 |
| `GET /requests/:id` per-reviewer scope | [DONE] | RequestDetailPage | RequestDetailPage | Yes | custody-change line still shows raw truncated hex IDs on web — humanize (Backlog U03) |
| `POST /requests` — types | [BROKEN — LOAN excluded] | RequestFormPage(TRANSFER/DISPOSAL) | same | Yes for TRANSFER/DISPOSAL | **LOAN can NEVER be created from any screen — add type with borrower + dueDate + condition fields** |
| `POST /requests/:id/approve` | [DONE] stage logic but transfer stage-2 UI missing | RequestDetailPage single approve | decide panel | **Partial** | stage-2 keyword text missing from RequestDetailPage — no stage-2 approval dedicated control |
| `POST /requests/:id/withdraw` | [DONE] | withdraw modal | — | Yes | logged |
| `POST /requests/:id/return-initiate/return-confirm/return-dispute` | [BACKEND only] | **no UI** | no UI | **No UI yet** | return handshake exists on backend (was expanded 15 Oct) |
| `GET /loans/overdue` | [BROKEN — no capability gate] | OverdueLoans widget (currently dead/inunused) | no | Partial | gate to requireCapability(LOAN_APPROVE) |
| `GET /users` ALL active users | [DONE] | AdminUsersPage | admin screens | Yes | **no pagination** on the admin users slice |
| `POST /users/invite` | [DONE unit-tested] | AdminUsersPage(s) invite | invite | **Blocked on DB col `AccountRequest.authorizedBy`** | invite form with `authorizedBy`/`authorizationRef` |

- **Blocked statuses:** `POST /users/invite` and its siblings are `DONE unit-tested` in code but cannot run against the live DB until the `AccountRequest.authorizedBy` columns exist (see §4.2 / Backlog B01).
- AdminActionLog IS written on invite/resend/accept (invites service) and on approve/reject/escalate (users.ts) as of the current tree — the "log is empty" claims in old docs are stale; but append-only is still not DB-enforced.
- `GET /buildings` has a backend route; the nav row was removed until a Buildings screen exists (Backlog F12). When built, re-add the row.

### 6.2 Remaining endpoint inventory pointer

Full route-index text lives in `backend-audit-2026-10-20.md` §2.2a–c, including `auth.ts`'s aliased endpoints, `items.ts`'s edge paths, `audits.ts` + `auditCompletion.ts` (completion computes results from the frozen `PENDING` rows — the audit-scan path is the one that still needs flow verification), and the `systemConfig.ts` SYSTEM_ADMIN-only gating (`SYSTEM_CONFIG` capability). `services/email.ts` remains a stub — `NOTIFY_EMAIL` only logs.

---

## 7. Navigation/Role UX (per role — final resolutions)

### 7.1 Navigation (final — mirrors monolithic §13 with the KB's additions)

Nav items are data-driven (`NAV_ITEMS`), role-filtered, and each must map to a declared route. `navRoutes.test.tsx` walks the router for all roles and **fails the build** on any undeclared-in-nav path — so no more 404-by-cos-layout.

| Role | Sidebar/bottom-bar items (cap → cap only) |
|---|---|
| SYSTEM_ADMIN | Dashboard, Notifications, Accounts (`/admin/users`), System Status (`/admin/system`) |
| PROPERTY_OFFICER | Dashboard, **Scan a Tag** (emphasized), Browse Items (`/items`), Requests, Notifications, New item, Categories (`/admin/categories`), Audit history, Reports |
| DEPARTMENT_HEAD | Dashboard, Browse Items (`/items?scope=all`), Department Requests, Notifications, Accounts (approvals tab via `approvals-count`) |
| STAFF | Dashboard, Browse Items (`/items?scope=mine`), My Requests (`/requests?mine=true`), Notifications |
| AUDITOR | Dashboard, Notifications, Active Audit (`/audit/new`), Audit history, Reports |

Badge types: `"pending-count"` (requests decision queue), `"approvals-count"` (account requests queue), `"unread-notifications"`. The badges self-gate via capability, not role-blind hardcode. In `AppLayout`, `badgeFor` handles all three.

### 7.2 Ruling on removed nav rows

`navConfig.ts` documents four intentionally removed rows (`/account-requests`, `/buildings`, `/admin/account-requests`, `/admin/system`-as-queue): these features remain unbuilt (Pages are `[BUILD]`); when you build any of them, re-add the nav row + real screen in the same slice.
- **The `Accounts` nav row on `/admin/users` is the DEPARTMENT_HEAD + SYSTEM_ADMIN tab surface (approvals tab carried).**
- **The `/admin/users` password-reset modal is OPEN but DEAD** — every rendered button path doesn't call it (Backlog P1).

### 7.3 Route table

Up-to-date full route table in Frontend audit §1 (ultimately confirmed in `frontend/src/app/router.tsx`).

---

## 8. UI/UX standards — responsive, a11y, design tokens

**Both shells** (AauHeader shared chrome; desktop sidebar + sticky; below-`lg` bottom tab bar with up to 4 primary slots + "More" sheet overflows; body scroll-lock + body `--app-header-h` measured via ResizeObserver; safe-area inset for notched phones; skip-link + a11y discipline: focus-visible ring, focus to `<main>` on nav change, `aria-*`, "never colour-only" tone).

- **AAU brand tokens** live in `frontend/src/styles/tokens.css` (`@theme` compiled; brand-* to AAU blue `#026CA9` / footer navy `#01324E`, accent/danger to AAU red `#FA0269-family`). Geist Sans + GeistMono + Geist, JetBrains Mono, Noto Sans Ethiopic for Amharic wordmark.
- **AAU crest/gateLions** real assets live under `frontend/src/assets` and mirror in `frontend/src/components/aau` widgets (`AauHeader`, `AauFooter`, `AauLogo`, `PortalPageHeader`, `PortalTile` for saturated blue/gold action tiles).
- **Print styles scoped to `[data-print-tag]`**, for the QR sticker print path; `.tag-id` monospace identity class.
- **Mobile bottom-tab bar** uses `safe-area-inset-bottom`, counts badges; survive the "More" overflow sheet for items that don't fit one of 4 primary slots; bottom bar adapt to role-filtered `NAV_ITEMS` by putting "fits <4" primary nav items first.
- Update `Amharic` (both data in `tokens.css` and text strings — per `frontend/src/lib/permissions.ts`) and AAU crest on `mobile` too.
- `Amharic` translations are FR-strings — not yet implemented; **do this periodically (persistent delay)** — the `tokens.css` already carries `Noto Sans Ethiopic`.

## 9. Scope & visibility rules (authoritative — from `itemScope.ts` + `itemVisibility.ts`)

- `activeItemsWhere(extra)` **ALWAYS pins `status: "ACTIVE"` last** — a caller's `?status=DISPOSED` cannot widen it (asserted invariant; don't ever disable the pin-last).
- `allItemsWhere(extra)` is identity — its entire job is being greppable marker for "disposed items included ON PURPOSE" (only reports `GET /reports/disposals` uses it).
- `disposed` item-handled public 410 with `DISPOSED_PUBLIC_MESSAGE = "This item is no longer in service"` — quoted verbatim from acceptance criterion F7.3; do NOT change the string.
- Scope lever computed by `itemListScope(actor)` — STAFF default: own holdings (ownerId OR holderId=STAFF+holderId); DEPARTMENT_HEAD: `orgUnitId IN (unitScopeIds subtree)` — until overridden by an explicit `?scope=all` (then `undefined`), which unions in all departments.
- By-row `itemInScope(actor, item)` mirrors the list-scope rules for by-ID/tag reads; out-of-scope reads yield **404** (never 403, never a partial leak).
- **.SYSTEM ADMIN sees zero items on `/items`** — deliberately maps to `{ id: { in: [] } }`. Verified live 14 Oct. Maintain.
- Anonymous responses **strip: `cost`, custodian/holder identity, exact room-level location** (`sanitizeItem` deny-list; audit-S1 last gap = still returns building/floor/room at current code — Backlog).

### 9.1 Restricted STAFF catalog browse (NEW tier, per spec §9.1 — structural, NOT client-side filter)

The STAFF catalog (`GET /catalog`) returns ONLY: `name`, `category`, `building` (NO floor/room), `status`. Used when STAFF wants to *request* an asset without seeing cost/custodian/room. Implemented in `GET /` (cross-department) and `GET /department` in `routes/catalog.ts` via `sanitizeItem`.

---

## 10. Feature status matrix (verified 20 Oct, code only)

Legend: `[DONE]` = built, wired, tested + live behavior proof · `[PARTIAL]` = built but gaps · `[BROKEN]` = built but code breaks at runtime or wrong wiring · `[NO-TEST]` = code exists only under unit tests, no flow-verified path · `[BUILD]` = doesn't exist yet · `[REMOVE]` = exists but should not.

### 10.1 Backend

| Area | Status | Notes / evidence |
|---|---|---|
| Prisma schema 13 enums + 14 models | [DONE] | `backend-audit-2026-10-20.md` §1 — but §4.2 migration drift blocking-strong |
| JWT auth + `tokenVersion` viv VIA `ver` claim | [DONE] | legacy tokens without `ver` skip DB-check by design (≤1-day RV) — OK; no `mustChangePassword` retirement v2 |
| Login rate limiting | [PARTIAL] | in-process per-container only; NOT distributed. Under back-`NODE_ENV=test` disabled |
| Change password + `tokenVersion` bump | [DONE] | auth.ts route + tests |
| Privileged invite + accept | [DONE unit-tested, BLOCKED from live verify] | T6, 41 tests; blocked by `AccountRequest.authorizedBy` column missing on live DB (§4.2) |
| AdminActionLog on approval decisions | [DONE] | approved/reject/escalate + invite/resend/accept logged; **append-only not DB-enforced** |
| Staff self-registration intake | [BROKEN] | `POST /auth/account-requests` writes `User.department` descriptor not in schema (auth.ts:131) — **always 500**; never sets `orgUnitId`/`staffId`; no verify-email endpoint at all |
| Approval queue scoped (HEAD own unit / SYS_ADMIN fallback) | [DONE] | queue patrol live; escalate-by-approver fallback = str `[ESCALATED]`|reviewNote marker hack (Backlog) |
| `resolveApprover` head→parent→SYSTEM_ADMIN fallback | [BROKEN] | function exists with tests (`approvers.ts`) but **never wired to any queue/approval route** (grep: only defined in `approvers.ts:11`) |
| Item registration + claim-due stamp | [DONE] | items.ts POST /; custody CREATED |
| Claim handshake (claim / refuse / correction) | [PARTIAL] | refuse-claim works; **claim-with-correction has no UI wiring on either frontend** |
| Verify-confirm / verify-flag (handover) | [NO-TEST] | backend routes exist; **no UI caller anywhere**; enforced-state (can't transfer REVERTED) unverified |
| Void (ITEM_VOID) | [PARTIAL] | route + tests exist; no e2e flow verification in production |
| Disposal + cascade to sub-accessories | [DONE] | cascade covered by route/tests |
| Disposal reversal | [PARTIAL] | backend route + `DISPOSAL_REVERSE` capability exist; **no UI caller on web or mobile**; flow unverified live |
| Transfer two-stage | [PARTIAL] | stage-1 and stage-2 approve via a single `POST /requests/:id/approve` — no stage-2 dedicated control on UI |
| Loan request intake | [BROKEN] | `REQUEST_TYPES = ["TRANSFER","DISPOSAL"]` excludes LOAN — approving/return/dispute all exist; nothing can file a loan |
| Loan return handshake (initiate / confirm / dispute) | [BACKEND done, NO UI] | three-endpoint handshake replaced the old single-step return |
| Expiry/escalation (claim, revert, loan grace) | [BROKEN] | ALL 3 of `expiry.ts`-surface and `expiryEscalation.ts`-reference `Item.updatedAt`/`Request.updatedAt`, not in schema. Also there are two divergent services doing the same job — merge the two |
| Audits (open, scan, complete) | [DONE + 12 tests] | frozen PENDING rows compute MISSING/LOCATION_MISMATCH at completion — backend solid |
| Reports (inventory/disposals/audit/evidence-pack) | [PARTIAL — evidence-pack BROKEN] | `GET /reports/audit-evidence-pack` queries `sessionNumber/type/scope/itemCount` — fields DON'T exist on AuditSession — guaranteed 500 |
| Holdings export `GET /export/holdings` | [BUILD] | no route |
| Notifications + email stub | [PARTIAL] | in-app + `[CODE]-prefix` approach; email transport stub (console only); anything users "look for email" (reset link, invite) won't arrive |

### 10.2 Frontend (web)

| Area | Status | Notes |
|---|---|---|
| Route table + guards (5 roles) | [DONE] | `navRoutes.test.tsx` (17 tests) pass |
| Login + forced password change + change | [DONE] | 2-layer funnel (login redirect + RequireAuth catch-all) |
| Account request page | [PARTIAL] | form exists but **sends raw `department`-name string alongside the typed payload with no `department` field** — server rejects it after dropping `User.department` descriptor |
| Invite acceptance | [DONE] | 3 designed states (no token / rejected token / form) |
| Dashboard per role (5 different branches) | [DONE] | role-scoped widgets + graceful fallbacks; AUDITOR branch verified; SYSTEM_ADMIN branch verified |
| Items browse (scope filter, URL-synced) | [DONE] | role-specific scope options per §9; skeleton/empty/offline states everywhere |
| Items create/edit | [DONE] | 409 disposed-mid-edit surfaced; photo upload with pending-photo slice; `isDirty` gating |
| Tag workbench (regenerate + accessories) | [DONE] | print/QR fine |
| Requests list + filters | [DONE] | window enum + URL-synced; fixed |
| Request detail + decision surface | [PARTIAL] | stage-2 dedicated control MISSING; custody-change line shows raw truncated hex — convert to "from HOLDER → to HOLDER" humanized line; SearchXIfNeeded() dead stub |
| Request form | [PARTIAL] | only TRANSFER/DISPOSAL enum — no LOAN type in the form |
| Audit screens | [DONE] | New (DEPARTMENT or BUILDING scope) + scan (QR + manual + 10s cooldown + sessionStorage walkthrough) + complete ConfirmDialog; audit-list filters CSV download |
| Audit abandon | [BROKEN] | ConfirmDialog opens → **fake success toast**, code walks `// TODO: Call abandon API endpoint when implemented` (line 90) |
| Audit report | [DONE] | instant summary from router state + breakdown from read-back; graceful download-failure copy |
| Reports page (4 tabs, CSV+PDF) | [DONE] | date-range presets computed client-side; range validation; `saveReport` |
| Admin users (approvals / invite / accounts tabs) | [PARTIAL] | Fine overall; password-reset modal dead (never opened by any button); **no pagination** on users slice |
| Admin categories | [DONE] | delete refused with reason while `itemCount > 0` |
| System status page | [PARTIAL] | minimal env/version/db rows; no retry button, no OfflineState; uptime/lastDeploy never rendered |
| Department detail (2 tabs + staff) | [PARTIAL] | hardcoded fake category IDs ("1","2","3"); summary card shows **department name** in the "Department Head" field; emerald/amber colors off-theme |
| Catalog + department catalog | [REMOVE] | `/catalog` orphan route (no nav entry); `CatalogPage` card links hard-code `/items?mine=true` ignoring the clicked item; `DepartmentCatalogPage` is unrouted dead code |
| Map | [DONE] | grouping all items by building; roadside pages all — but a caption says "Showing up to 100 items" (stale copy) |
| Notifications (all 4 ops + optimistic UX) | [DONE] | unknown codes still render; never-error |
| Landing + scan + map + 404 | [DONE] | role-aware home-link on shared 404 |

### 10.3 Mobile (Flutter)

| Area | Status | Notes |
|---|---|---|
| 5-role model | [DONE] | enums.dart 19-25 confirms 5 roles; 2 stale `Role.accountAdmin` references remain as analyze errors |
| Riverpod auth + capability getters | [DONE] | bootstrap; AuthController Notifier |
| Screens (login, map, scan, items, dashboard, requests, notifications, audits, reports, admin, categories) | [DONE structural] | full workbench + shells; `flutter analyze` 2 error + 2 infos |
| Login + token (secure storage) + 401 handling | [DONE] | single 401 handler clears token; no refresh-token concept (1-day JWT) |
| QR scan | [DONE] | mobile_scanner; `/scan` + audit walkthrough |
| Invite acceptance | [REMOVE — mobile lacking feature] | has no back-end call / admin screen (users_api.dart only a doc comment). Invited privileged users must use web. |
| Account request | [DONE] | request-account screen |
| Request-withdraw / loan-return / verify flows | [REMOVE — mobile missing] | not implemented |
| hardcoded clipboard shared-link | [PARTIAL] | `https://cncs-pms.aau.edu.et/item/<tagId>` though prod is vercel.app domain — doesn't resolve |

### 10.4 Integrity/Security (standing S1 rules — verify EVERY release)

| Rule | Status |
|---|---|
| Anonymous `/items` gets 401 (no silent downgrade) | [DONE] verified 15 Oct |
| By-id by-tag scope check → 404 out-of-scope | [DONE] verified 15 Oct (`itemInScope` mirrors list scope) |
| SYSTEM_ADMIN zero asset rows on `/items`, `/requests`, `/reports` | [DONE] verified live 14 Oct — `scopeToViewer`/`itemListScope` map SYSTEM_ADMIN to `{ id: { in: [] } }` |
| `/system/events` excludes asset/audit activity, uses AdminActionLog only | [DONE] verified 14 Oct (`systemConfig.test.ts` asserts audit tables are never queried) |
| `/reports/inventory`, `/requests/*` 500s | [FIXED 14 Oct] — was Neon TCP failure, not code; `dbRetry.ts` wraps with retry — 0 failures in 90 requests after fix |
| Anonymous responses strip `cost`+custodian but still expose building/floor/room | [PARTIAL] — S1 gap; Backlog P1 |
| Optimistic locking `version` CAS on item write | [DONE] |
| Lifetime `pin` uniqueness + audit-result uniqueness | [DONE] |
| Session invalidation on role change (`tokenVersion` bump) | [DONE] |
| Login rate-limit | [PARTIAL] (in-process only) |
| Upload cap 5 MB + MIME allow-list + Cloudinary streaming | [DONE] — reject path test missing for 5MB/MIME (Backlog) |
| DB-enforced prohibited UPDATE on log tables | [BUILD] (intense DB-role work; append-only "by convention" now) |

---

## 11. Security rules that DON'T fall under scope matrix (standing)

- **CORS fails closed in production** + startup warning; unset in prod fails closed.
- Upload limit/mime gate; photo storage streams to Cloudinary (5 MB `PHOTO_MAX_BYTES`).
- No stack traces in API error responses (errorHandler is strict).
- Login refuses AFTER the password check — a wrong-password response never confirms whether an account exists.
- Self-registration returns an identical response whether the email is new or already requested (anti-enumeration).
- "Account exists" oracles avoided everywhere (out-of-scope reads → 404, not 403; see ground rule 3).

---

## 12. Integration contract: backend ↔ frontend ↔ mobile binding

An endpoint is `[DONE]` only when it appears with **Wired=Yes** in this file AND the frontends SEND/READ the API properly:

- All endpoints exist dual-mounted at `/api/v1/<name>` and `/<name>` (see §6). Canonical: `/api/v1` only — keep the legacy mounts until both frontends use the canonical prefix everywhere, then drop them.
- **`GET /items` requires authentication** (no anonymous fallback since 15 Oct). The web router still serves `/items` through the public shell for anonymous visitors — decide and implement: either redirect anonymous visitors from `/items` to `/login?next=/items`, or render a clear "sign in to browse the register" state instead of a failed fetch.
- Frontend keeps **Bearer token from localStorage** in `lib/apiClient.ts`; **single 401 handler** clears token + React Query cache + toast + redirect to `/login?next`.
- Every fetch path goes through `lib/apiClient.ts` — NO bare tokenless `fetch` (this was the 15 Oct dashboard-tiles bug series: bare root-relative fetches resolved against the frontend host and swallowed every failure into fake empty states).

---

## 13. Bug list — checked manually (file:line)

- backend `routes/auth.ts:131` — `department` field on the self-registration; always PrismaClientValidationError → 500 (and no orgUnitId / staffId set)
- backend `routes/users.ts:1325-1396` — `User.expiresAt` is a column that does NOT exist; invite list + resend + reload through this column either 500 always
- backend `routes/reports.ts:630-658` — audit evidence pack selects `sessionNumber/type/scope/itemCount` which are NOT fields on AuditSession — guaranteed 500
- backend `routes/expiry.ts:71`, `services/expiry.ts:170`, `services/expiryEscalation.ts:214,276` — `Item.updatedAt`/`Request.updatedAt` never exist in schema — 500 the whole expiry/escalation surface
- backend `REQUEST_TYPES` (requests.ts:64) — excludes LOAN — loan intake broken
- backend `GET /loans/overdue` — comment says "Property Officer only", but the chain has no capability check beyond `authenticate` (Backlog B07)
- backend `users.ts` GET /users — no pagination on the full listing (the approval queue does paginate)
- backend `test-utils/index.ts` — uses `"ACCOUNT_ADMIN"` legacy maps
- backend `prisma/schema.prisma` no `updatedAt` — and migrate drift as per §4.2
- backend two divergent expiry services (expiry.ts vs expiryEscalation.ts) — same job, different config windows; consolidate
- frontend `features/departments/DepartmentDetailPage` — hardcoded `Electronics`/`Furniture`/`Lab Equipment` fake category ID options ("1","2","3"); "Department Head" summary card shows the department name not a person; emerald/amber colors off-theme
- frontend `/catalog` orphan route + bogus card links; `DepartmentCatalogPage` unrouted dead page
- frontend OverdueLoans widget + `useLoans` hooks + `api/loans.ts` never rendered (dead trio — re-wire to the PO dashboard to make overdue loans useful)
- frontend `AuditListPage` Abandon audit = fake success toast (line 90)
- frontend `MapPage` caption "Showing up to 100 items" — stale; paged whole register now
- frontend `AdminUsersPage` password-reset modal exists but never open — set dead UI (`setPasswordFor` never called)
- frontend `RequestFormPage` server error string-matching on `"pending"` is fragile
- frontend `SystemStatusPage` minimal with no retry / OfflineState
- frontend `AppLayout` stray odd formatting/`JSX` blocks outdented — works but sloppy
- frontend `.env.local` contains a live Vercel OIDC token sitting in an untracked local file — hygiene
- mobile `mobile/lib/widgets/status_badges.dart:160,169` — 2 stale `Role.accountAdmin` references (analyze errors)
- mobile `mobile/lib/features/items/item_detail_view.dart:281` — hardcoded clipboard shared-link `https://cncs-pms.aau.edu.et/item/<tagId>` doesn't resolve (prod is vercel.app)

---

## 14. Prioritized task backlog (checkboxes — tick with verification evidence)

Legend — priority: **P0** = blocking (deploy or required production correctness) · **P1** = core-flow gaps (features spec'd, expected soon) · **P2** = UX/polish/integrity · **P3** = later phase. Tick a checkbox ONLY on live-verified evidence; note evidence/citation and date next to it.

### 14.0 P0 — deploy/correctness (do BEFORE anything else)

- [ ] **B01:** Resolve migration drift + FAILED row: `prisma migrate resolve --rolled-back 20261012000000_phase_a_expand` on a **staging copy** first, then live. Consolidate on-disk `20261014000000_account_invite_fields` (currently un-applied) in the same deploy.
- [ ] **B02:** Add `updatedAt @updatedAt` to `Item` AND `Request` in a new migration; keep `Prisma` model-time fields consistent.
- [ ] **B03:** Fix `routes/auth.ts:131` — self-registration writes `orgUnitId` + `staffId` (never `User.department`); AAU email domain allow-list; same response on duplicate email; rate-limit route too.
- [ ] **B04:** Fix `routes/users.ts` invite list/resend — replace `User.expiresAt` with the `AccountRequest`/`EmailToken` expiry mechanics (columns already exist in schema); join them for status rendering.
- [ ] **B05:** Fix `routes/reports.ts:630-658` — use actual AuditSession fields (`sessionType`,`reportNumber`,`scopeType`,`results[]`) for evidence pack.
- [ ] **B06:** Enable LOAN request intake — add LOAN to `REQUEST_TYPES`, add request fields (borrower claim tests, dueDate, condition), keep `approve` path in place.
- [ ] **B07:** Add requireCapability to `GET /loans/overdue` (PO only or capability match).
- [ ] **B08:** Wire claim-with-correction UI + verify-confirm/verify-flag UI + reverse-disposal UI on web AND mobile (detail page + handover screen).
- [ ] **B09:** Fix the request-account page payload — stop sending a raw `department` name string; send the selected unit's id (`orgUnitId`) matching what the backend will accept after B03. Backend bug tracked separately in the §13 list.
- [ ] **B10:** Flow verify end-to-end: register applicant → head approves → sign-in works; paste real responses in the PR (the T-account flow was previously never proven against a real request path).
- [ ] **B11:** Verify the same e2e flows on mobile after B01–B10 land (login, browse, request, decide, claim, audit). Document any mobile-only blockers with reproduction steps.

### 14.1 P1 — flow feature completeness (spec'd, near-term)

- [ ] **F01:** Wire OverdueLoans — re-attach the widget to the PO dashboard (currently a dead trio: unused widget + unused hook + unused API function).
- [ ] **F02:** Email verification — implement `POST /auth/verify-email` (single-use hashed token, per authority doc T4), make `PENDING_EMAIL_VERIFICATION` a real intake state, and add the verify-email page + sign-in pending/rejected/deactivated message states.
- [ ] **F03:** Real escalation status + `escalatedAt/ById` + `APPROVAL_ESCALATION_DAYS` (default 5) + lazy-on-read sweep.
- [ ] **F04:** Wire the `resolveApprover` head→parent→SYSTEM_ADMIN fallback into the approval queue route, and move the queue onto the `AccountRequest` model as the canonical flow (retire the legacy `User.accountStatus`-driven queue per D1).
- [ ] **F05:** `confirmedUnitId` honored only when the actor is SYSTEM_ADMIN (unit reassignment during approval) + write an AdminActionLog row for it.
- [ ] **F06:** Invite resend + revoke + an invite status list (SENT/RESENT/ACCEPTED/EXPIRED) with the escalation-window mechanics.
- [ ] **F07:** Deactivation (T7): head deactivates own-unit STAFF with cause + trail — deactivate must move the person's held items to `REVERTED_UNVERIFIED`, write a custody `HOLDER_DEACTIVATED` event, bump `tokenVersion`, log to AdminActionLog. SYSTEM_ADMIN deactivates privileged accounts; another SYSTEM_ADMIN for a SYSTEM_ADMIN; self-deactivation blocked everywhere.
- [ ] **F08:** Out-of-scope tag lookup message: "Not assigned to you, contact Property Office" (spec F2).
- [ ] **F09:** Three-way capability sync test (backend ↔ web ↔ mobile) as an automated test.
- [ ] **F10:** Strip remaining location leak (`building/floor/room`) from anonymous responses (last open S1 gap).
- [ ] **F11:** Consolidate the two divergent expiry services into ONE file; one configurable window framework everywhere (see §5.1 windows).
- [ ] **F12:** Buildings page — backend route exists; build the screen + nav row (PO only).
- [ ] **F13:** Add pagination to `GET /users`.
- [ ] **F14:** Decide + implement `mustChangePassword` retirement (legacy field) now that the invite/self-service flow exists.
- [ ] **F15:** Remove the dead admin password-reset UI (per C10 ruling: no admin ever sees or sets a password); replace with "admin triggers a reset-token email for the target user" — admin never sees the token.

### 14.2 P2 — UX / integrity / polish

- [ ] **U01:** Department detail fix — load real categories from the API (remove the fake "1"/"2"/"3" options), show the actual head person in the summary card (not the department name), use theme colors, and render the shared `NotFoundPage` instead of the inline Access Denied.
- [ ] **U02:** Remove the `/catalog` orphan route and the unrouted `DepartmentCatalogPage` dead page.
- [ ] **U03:** Request detail — humanize the `fromHolder → toHolder` custody line; remove the `SearchXIfNeeded()` dead stub; add a stage-2 dedicated approval control (see §10.2).
- [ ] **U04:** Request form — pass the preselected item as `?item=<tagId>` structural payload and handle server errors structurally (remove the fragile string-match on `"pending"`).
- [ ] **U05:** Map — fix the stale "Showing up to 100 items" caption (the map now pages through the whole register, up to 50×100).
- [ ] **U06:** `SystemStatusPage` — retry button + OfflineState + surface uptime/lastDeploy.
- [ ] **U07:** Abandon audit — implement `POST /audits/:id/abandon` on backend + wire the UI to the real call.
- [ ] **U08:** OwnerSelect a11y/keyboard; replace the custom dropdown with the design-system `Select`.
- [ ] **U09:** `RequireAuth` — `loading` renders null (full-page blank); show a shared skeleton instead.
- [ ] **U10:** Mobile — fix the hardcoded shared-link origin in `item_detail_view.dart:281`; derive it from the configured API/env value.
- [ ] **U11:** Mobile — add an invite-acceptance screen (`POST /auth/accept-invite`) or explicitly document web-only acceptance for invited privileged users.

### 14.3 P3 — growth (post-cutover)

- [ ] **G01:** Snapshot/frozen-at columns for reports — "frozen when official" is unimplemented today (`reportNumber` is the only freeze-ish column; no snapshot/frozen-at).
- [ ] **G02:** Bulk item import with optional image column (no route exists).
- [ ] **G03:** Amharic translations (frontend + mobile + backend emails); Noto Sans Ethiopic already in tokens.
- [ ] **G04:** Real email transport (Resend) + domain/DNS setup (supervisor decision §16.3).
- [ ] **G05:** Full push notif (FCM) — currently in-app inbox only
- [ ] **G06:** Reports: IFMIS/MoF fixed-asset format integration; consolidated evidence exports (aggregating multiple completed sessions; date-range)
- [ ] **G07:** Standing infra gaps never resolved: monitoring, DB backups, a real test database (all S1 from the gap analysis)
- [ ] **G08:** Admin review trail enforced at DB level: revoke UPDATE/DELETE on `AdminActionLog`, `CustodyEvent`, `AuditItemResultRow`, `ItemEditLog` via DB roles (append-only is "by convention" today).
- [ ] **G09:** Run the full 20-row live-verification table (authority doc §4) against the merged app, one row per role, pasting real responses.

---

## 15. Definition of Done (DoD — try to keep updated to this KB; post-20 Oct)

- [ ] All P0 done, with code refs and live verification evidence.
- [ ] All S1 security rules re-verified (anonymous 401, by-tag scope, SYS-ADMIN zero-asset-data: verify CURRENT revision, not old dead — Past live answers from 14-15 Oct don't count when new code ships).
- [ ] Account-approval supersede: `AccountRequest`-model-driven queue with `resolveApprover`-built fallback — 20 authority-table rows all live-verified with pasted responses.
- [ ] Mobile sync (5-role + full flow parity + three-way capability test + push + request flows free of dead stubs) — `flutter analyze` clean (0 error), CI workflow for mobile added.
- [ ] Three candidates: `(B9/manifests)`, `frontend/tests`, and `mobile/tests` — all green.
- [ ] The whole flow of the app verified by a human on both shells (desktop + mobile):
  register-with-claim, transfer (two-stage shared and insist that stage-2 item mutation moves holder + transfers are visible), disposal, loan, return, void, handover, deactivation, account approval + invite acceptance, password change, audit open/scan/complete/report.
- [ ] Every nav item opens a real scoped page for each of the 5 roles.
- [ ] Every widget's data connection fails gracefully — never renders a confident fake empty state (any endpoint failure is displayed, never a silent zero).

---

## 16. Open human decisions (do NOT guess — ask Yanet/supervisor)

1. `APPROVAL_ESCALATION_DAYS` value (working default 5, assumed).
2. Staff self-register into a headless unit (Physics)? — Assumed YES → landed to SYSTEM_ADMIN's queue (verify physics-headless test with 404 approval).
3. Accepted email domains allow-list; Resend domain/DNS (Resend free tier 100 mails/day, stagger rollout).
4. Which outside office authorizes heads / officers / auditors (invite form `authorizedBy` field options list).
5. May staff self-register into a headless unit? (same as #2)
6. Confirm supervisor's future needs for "role future Dean tier" (update `resolveApprover` + permission matrix = change two files, no schema rewrite if accommodated).

---

## 17. Doc-changes log

| Date | Change | Ruling |
|---|---|---|
| 20 Oct | Initial KB issued | Consolidated from 37 docs + 4 audits; C1–C19 conflicts all resolved above |
