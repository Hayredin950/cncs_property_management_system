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

### 1.1 Tech stack (verified)

| Layer | Stack |
|---|---|
| Backend | Node.js 22 · Express 5 · TypeScript (strict) · Prisma 7 (datasource URL in `prisma.config.ts`, not in `schema.prisma`) · Postgres on Neon · JWT (1-day) + argon2id · pnpm · Docker |
| Backend libs | zod validation · `@prisma/adapter-pg` with a custom retry wrapper (`lib/dbRetry.ts`) · multer → Cloudinary (cloud `r3rzw77s`, no disk on Vercel) · hand-rolled CSV/PDF (no deps) |
| Frontend | React 19 · Vite · TypeScript (strict) · Tailwind v4 (CSS-first `@theme`) · React Router v7 (data router) · TanStack Query v5 · react-hook-form + zod · html5-qrcode · lucide-react · sonner · Vitest + RTL + MSW |
| Mobile | Flutter · go_router · flutter_riverpod · dio · flutter_secure_storage · mobile_scanner · flutter test (13 test files; **no CI workflow for mobile**) |
| Infra | Vercel (2 projects) · Neon Postgres (pooled `DATABASE_URL` + unpooled `DIRECT_URL`) · Cloudinary · GitHub Actions (backend + frontend CI) |

### 1.2 Org hierarchy

```
College (CNCS — one college in scope)
  └── Department (CS · Biology · Chemistry · Physics)
        └── Individual (staff / head holding assets personally)
```
`OrgUnit` is self-referencing (`parentId`, `type` = COLLEGE | DEPARTMENT | LAB_GROUP). **Physics deliberately has no head** — it exercises the vacant-head fallback to SYSTEM_ADMIN. One active head per unit; a user heads at most one unit; `acceptsSelfReg` gates which units accept self-registration.

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
| `ITEM_READ_ALL` | **—** | ✔ | ✔ (granted; the field rule limits a head to their own department — §3.1.2) | — | ✔ |
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
| `REPORT_VIEW_ALL` | — | ✔ | ✔ (dept-scoped by the scope rules, not by a separate capability) | — | ✔ |
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
- `REPORT_RUN_DEPARTMENT` / `REPORT_RUN_COLLEGE` (older doc names) do **not** exist in code — `REPORT_VIEW_ALL` is the single report capability; department vs college scope is decided by the row-scope rules, not by a separate grant.

### 3.1.1 Verified three-way drift (backend ↔ web ↔ mobile) — measured 20 Oct

The backend matrix is authoritative (27 capability strings). The clients are hand-copied mirrors, and they have drifted. Measured exactly:

| Drift | Backend | Web (`frontend/src/lib/permissions.ts`) | Mobile (`mobile/lib/models/permissions.dart`) | Effect |
|---|---|---|---|---|
| `SYSTEM_CONFIG` | SYSTEM_ADMIN ✔ | **missing** → now added | SYSTEM_ADMIN ✔ | the web client had no constant to gate the System Status screen on |
| `DISPOSAL_REVERSE` | PROPERTY_OFFICER ✔ | **missing** → now added | **missing** → now added | no client could express "may reverse a disposal" — the reverse-disposal UI had no predicate to check |
| `ITEM_READ_ALL` for DEPARTMENT_HEAD | ✔ | **missing** → now added | **missing** → now added | the server grants it and it is **not** dead: it is the route gate on `GET /items/recent` and `GET /items/:id/history`. What it must not be is *unscoped* — see §3.1.2. |

Everything else matches exactly (STAFF, AUDITOR, PROPERTY_OFFICER sets are identical across all three; the 6-role `ACCOUNT_ADMIN` residue is mobile-only, §3).
**Ruling:** the backend matrix is the single source; the clients mirror it exactly, and **`frontend/src/test/capabilityParity.test.ts` fails the build on any drift** (it reads all three files and compares them role by role; it was verified to fail when a grant is removed by hand).

### 3.1.0 The three checks that catch what the unit tests cannot

| Check | What it does | Where |
|---|---|---|
| `scripts/check-api-contract.mjs` | compares every client call with every server route; fails the build on a mismatch | `frontend.yaml` |
| `scripts/e2e-flows.sh` | builds a real database from the migrations, seeds it, starts the real server against it and drives the real flows over HTTP | `e2e.yaml` |
| `scripts/responsive-check.py` | drives the **deployed** app in Chromium at 390px and 1440px, for every screen every role can reach: does it render, does anything overflow sideways, are the tap targets big enough, was any request refused | run it by hand; it needs a browser |
| `scripts/live-walkthrough.sh` | walks the **deployed** app role by role — what each role sees, the account-approval flow end to end, and the refusals | run it by hand (it signs in as seven accounts, so the login rate limiter is the reason it caches its tokens) |

All three exist because the unit suites **mock Prisma** and never open a browser: they cannot see a query that is wrong in SQL, a column that does not exist, a route that was renamed, a client asking for something the server will refuse, or a layout that breaks on a phone.

Between them they found: the approvals-queue bug (a Department Head never saw a newly submitted account request, while every test and the CI badge stayed green), two client/server contract breaks, a 403 on every page the Property Officer opened, a Department Head's screen asking for an account list they may not read, a request row that overflowed a phone by 94px, and every small button being 36px on a phone against the design system's own 44px claim.

### 3.1.1a The API contract check (new, and it earns its keep)

`scripts/check-api-contract.mjs` compares every call the web and mobile clients make with every route the server declares, and fails the build when a client calls something that does not exist. It runs in `frontend.yaml`.

It found two real breaks on the day it was written, neither of which any test had caught:

| Break | Effect | Fix |
|---|---|---|
| `fetchInvitableUnits` read `response.units`, but `GET /departments/invitable` answers with a **bare array** | `undefined` → React Query rejects it → **the whole `/admin/users` screen failed to render in production** (invite form, accounts list, approvals queue) | the client reads the array |
| the mobile client called `DELETE /items/:id` | the server has never had that route — items are **voided**, never deleted — so the call would 404 | replaced with `voidItem(id, reason)` → `POST /items/:id/void` |

The second one is the shape of bug that hides best: the method existed, was never called by any screen, and would have failed the first time somebody wired it up.

### 3.1.1b The three tiers of an item, measured on the deployed app

What a person sees of an item is decided by **two** questions, and until 21 Oct they were answered by one:

1. **May they open it?** — the holder, their department, and the college-wide
   readers (a property officer, an auditor) may. A staff member and a
   department head may open an item **outside** their own scope: the register is
   the college's, and "what does the rest of the college have?" is the question a
   person asks when they need to request something. The one thing nobody may
   open is **another department's pool** — the items a department holds for
   itself. That is the department's own business, not a catalogue.
2. **May they administer it?** — the holder, a property officer, an auditor, and
   a department head for **their own** department. The change history belongs to
   these people: it names who made each change and shows the old and new value
   of every field, including the value and the custodian that the same viewer
   is not shown on the item itself.

The result, measured on the deployed app for one Biology laptop viewed from three roles:

| Field | Staff | Department head | Property Officer | The holder |
|---|---|---|---|---|
| name · status · condition · photo | ✓ | ✓ | ✓ | ✓ |
| department · building · floor · room | ✓ | ✓ | ✓ | ✓ |
| brand · model · serial number · notes | ✓ | ✓ | ✓ | ✓ |
| purchase cost · current value | ✓ | ✓ | ✓ | ✓ |
| custodian (name + email) | ✓ | ✓ | ✓ | ✓ |
| **the change history** | — | their own department | ✓ | ✓ |

**One tier for the item, one line for the change log.** Everybody in the college sees the whole record: the register is the college's, and a person looking for something to request needs the make and model ("will this do the job?"), the serial number, the price ("what would replacing it cost?") and the custodian ("who do I ask?"). Restricting those protected nothing a colleague could not learn from the staff list, and it made the register harder to use — the rule that "the register is not a secret from the college" is the simpler and the more useful one.

The **change history** keeps its own line: it is the trail of *who changed what* and the values before and after — the registry's audit record, which belongs to the people who answer for the asset (the holder, a property officer, an auditor, and a head for their own department). It is served by its own endpoint and gated there; a viewer who may open an item but not administer it is told so in a sentence rather than shown a failure.

**Two questions, not three.**

1. **May you open it?** — about the *college's register*. Anybody in the college may open an item, because you have to be able to see what exists before you can request it. The one thing nobody may open is another department's **pool** — the items a department holds for itself. That is the department's own business, not a catalogue.
2. **May you administer it?** — about *your* equipment, and the only thing it decides is the **change history**. The change log is the sharpest case: it names the people who made each change and shows the old and new value of every field. It belongs to the people who answer for the asset.

A department head passes the second for their **own** department and not for another one. And the item's own fields are the same for everybody — the register is the college's.

**The two bugs this uncovered** (both fixed 21 Oct):
1. The page gated whole **sections** on one flag — "does this payload carry the custodian?" — so a head whose payload carried the make and model but not the custodian got a page with **no Specs section at all**, even though the data was in the response. That is where the brand went.
2. The field filter read the viewer's unit from `departmentId`, but the session carries `orgUnitId` — so the branch that gives a head the full detail of their **own** department never fired. The head who administers a department could not read its register. The test that "proved" it passed because it spoke the old field name: **the tests were in a different language from the code.**

Two rules that came out of it: the **status** is shown to everyone (a person
looking at a laptop needs to know whether it is in service, on loan or
disposed), and the custodian's record is stripped **whole** — the name *and*
the id behind it, because a payload carrying the id without the record makes
the client believe it has the privileged view and render an empty owner.

### 3.1.2 Two custody-field rulings (measured, not inferred)

1. **`ownerId` is legacy but still returned to privileged callers.** `utils/filterItemFields.ts` strips `ownerId`/`owner` for restricted (public/anonymous) views, but the privileged payload keeps it alongside the holder pair — so a Property Officer/Auditor payload carries **two sources of truth for custody** (`ownerId` and `holderType`/`holderId`), both dual-written by `services/holder.ts`. Cleanup item: stop returning `ownerId` to clients once the contract migration drops the column (it is a schema-column decision, not a leak).
2. **`ITEM_READ_ALL` for DEPARTMENT_HEAD: granted, and it must stay scoped.**
   The grant is real — it is the route gate on `GET /items/recent` and `GET /items/:id/history` — but the *field* rule is deliberately finer: `utils/filterItemFields.ts` gives full detail to a role in `FULL_DETAIL_ROLES` (PROPERTY_OFFICER, AUDITOR), to the custodian, and to a Department Head **for their own department's items only**. That per-item rule is the correct behaviour for a head, and it is what the web and mobile mirrors now reflect (both grant the capability, because it is what opens the read routes).

   What was wrong was the **route**, not the grant: `GET /items/recent` applied no scope at all, so a Department Head received the names and tag ids of items registered in **other departments** — the one item read in the app that did not go through the scope rules. It now goes through `itemListScope`, like every other read.

   **Still open (a question for the supervisor, not a bug):** `GET /items/:id/history` lets a Department Head read the edit history of a cross-department item (the code calls it out deliberately: "their department items, cross-department items (from catalog), and items they personally hold"). The catalog is a *restricted* view of another department's items, so a head can see that an item exists — but its **edit log** (who changed what, old and new values) is more than the catalog exposes. Decide whether to keep it.

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

**Migration history on disk, in order** (`backend/prisma/migrations/`):

| # | Migration | What it does | State |
|---|---|---|---|
| 1 | `20260901115514_init` | initial schema | applied |
| 2 | `20260924000000_add_token_version_and_password_reset` | `tokenVersion`, `mustChangePassword` | applied |
| 3 | `20261012000000_phase_a_expand` | expands the schema for phase A | **FAILED row in `_prisma_migrations` → P3009 blocker** |
| 4 | `20261012010000_role_five_role_enum` | 5-role enum | applied |
| 5 | `20261012020000_backfill_holder_fields` | `holderType`/`holderId` | applied |
| 6 | `20261012030000_account_approval_queue` | `AccountRequest`/`EmailToken`/`AdminActionLog` | **the tables were created outside migration history — no migration actually creates them** |
| 7 | `20261014000000_account_invite_fields` | 7 invite columns + `invitedById` FK | **on disk, NOT applied to the live DB** |
| 8 | `20261017102500_delete_system_admin_item_notifications` | filters notifications | applied |

**The drift, item by item:**

- `20261012000000_phase_a_expand` adds `User.departmentId`/`Item.departmentId` FKs to a `"Department"` model that **does not exist in the current schema** (OrgUnit replaced it).
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
        │     ├─ return-confirm(lender/PO) ──► ACTIVE (custody `TRANSFERRED` written back to the lender)
        │     └─ return-dispute(lender/PO) ──► stays LOANED; dispute recorded → escalates to Property Officer
        │        (lender return-confirm expiry) — same CLAIM_WINDOW_DAYS framework as every other handshake
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

- **One PENDING-family request per item** at a time (409 on a second filing). Competing requests on an item that is already granted become WAITLISTED with a public reason — never silent (monolithic D5).
- **Maker-checker:** the initiator can never approve their own request; stage-1 (releasing side) and stage-2 (receiving side) approvals are by different people, and the item mutation happens exactly once.
- STAFF-held items can file TRANSFER / DISPOSAL. Loan request intake is currently broken (no LOAN in `REQUEST_TYPES` — see §13 bug list).

### 5.3 Account & registration handshakes

- **Self-registration (STAFF):** file → `PENDING_APPROVAL` → the active head of the chosen unit decides (approve → `ACTIVE`, reject → `REJECTED` with a reason). An approver outside scope gets 404 and the row is never read or mutated (fail-closed).
- **Privileged invite:** SYSTEM_ADMIN issues (role + unit + `authorizedBy` + `authorizationRef`, all required and validated) → invitee opens the link → sets their own password → `ACTIVE` (recorded as `INVITE_ACCEPTED` in AdminActionLog).
- Nobody approves their own account. The role of a self-registered account is forced to STAFF. `tokenVersion` is bumped on every approval/role change so older sessions die immediately.

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

### 5.5 Handshake summary matrix (one pattern, applied everywhere)

| Action | Initiate | Approve | Confirm / claim | Decline path |
|---|---|---|---|---|
| Registration | Property Officer (registers an item) | — | Assigned holder claims | `refuse-claim` (reverts to COLLEGE pool) |
| Transfer → individual | Requester | Stage 1 (releasing head) + Stage 2 (receiving head) | Recipient claims | `refuse-claim` → reverts to prior holder, both heads notified |
| Transfer → department | Requester | Stage 1 + Stage 2 heads | — (stage-2 approval **is** the department's acceptance) | reject at either stage |
| Loan start | Borrower files | Approving head / officer | Borrower claims → then `LOANED`, due date from the **claim** time | claim expiry → loan auto-cancels, approver notified |
| Loan return | Borrower (`return-initiate`) | — | Lender/officer (`return-confirm`) | `return-dispute` → escalates to Property Officer, stays `LOANED` |
| Disposal | Requester | Property Officer | — (terminal) | reject; later `reverse-disposal` (logged correction) |
| Handover | SYSTEM_ADMIN activates the new head | — | New head verifies each item (`verify-confirm` / `verify-flag`) | FLAG follows the audit-MISSING path (confirmed LOST or re-check) |
| Account request | Applicant | Unit head → (parent head) → SYSTEM_ADMIN | — (activation **is** the confirmation) | reject with a reason |
| Privileged invite | SYSTEM_ADMIN | — (`authorizedBy` + `authorizationRef` **are** the approval record) | Invitee sets their own password | link expires unused; revoke/resend not built yet |

Verified in code: transfer-to-individual sets `PENDING_CLAIM` (`services/requestWorkflow.ts:501`); loan approval sets `PENDING_CLAIM` before `LOANED` (`requestWorkflow.ts:514-518`).

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
| `POST /items/:id/claim` | [PARTIAL] | item detail disclosure | claim | Partial | route exists + unit-tested (mocked Prisma); **no end-to-end flow verification against a real DB** |
| `POST /items/:id/refuse-claim` | [DONE] | same disclosure | refuse | Partial | reason set: `NEVER_RECEIVED`, `WRONG_ITEM`, `CONDITION_MISMATCH`, `OTHER`; both dept heads notified |
| `POST /items/:id/claim-with-correction` | [CODE only] | no web caller | no mobile caller | **No UI yet** | wire into the claim disclosure (spec §6) |
| `POST /items/:id/verify-confirm` + `verify-flag` | [CODE only] | no caller | no caller | **No UI yet** | required for `REVERTED_UNVERIFIED` handover verification (spec §5.3) |
| `POST /items/:id/reverse-disposal` | [CODE only] | no caller | no caller | **No UI yet** | post-disposal correction path (spec §4.3) |
| `POST /items/:id/void` | [DONE] | ItemStaffPage | delete | Partial | endpoint + tests exist; no end-to-end flow verification yet |
| `GET /requests` window filter(s) | [DONE] | RequestsListPage | RequestsListPage | Yes | `this-week/this-month/last-30-days/custom` URL-synced; fixed |
| `GET /requests/pending-count` | [DONE] | badge | badge | Yes | `/requests/pending` deliberate 404 |
| `GET /requests/:id` per-reviewer scope | [DONE] | RequestDetailPage | RequestDetailPage | Yes | custody-change line still shows raw truncated hex IDs on web — humanize (Backlog U03) |
| `POST /requests` — types | [BROKEN — LOAN excluded] | RequestFormPage(TRANSFER/DISPOSAL) | same | Yes for TRANSFER/DISPOSAL | **LOAN can NEVER be created from any screen — add type with borrower + dueDate + condition fields** |
| `POST /requests/:id/approve` | [PARTIAL] | RequestDetailPage single approve/reject pair | decide panel | Partial | stage logic correct server-side, but there is no **stage-2 dedicated control** in the UI — the decision surface does not distinguish stage 1 from stage 2 |
| `POST /requests/:id/withdraw` | [DONE] | withdraw modal | — | Yes | requester-only, pre-approval, logged |
| `POST /requests/:id/return-initiate` / `return-confirm` / `return-dispute` | [BACKEND only] | **no UI** | no UI | **No UI yet** | the three-endpoint return handshake exists server-side (spec §3.6) — the old single-step `POST /requests/:id/return` is superseded by it |
| `GET /loans/overdue` | [BROKEN — no capability gate] | OverdueLoans widget (not currently rendered) | no | Partial | add `requireCapability(LOAN_APPROVE)` (Backlog B07) |
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

Nav items are data-driven (`NAV_ITEMS`), role-filtered, and each must map to a declared route. `navRoutes.test.tsx` walks the router for all roles and **fails the build** on any nav path that has no route — so no more 404-by-nav-layout.

| Role | Sidebar/bottom-bar items (cap → cap only) |
|---|---|
| SYSTEM_ADMIN | Dashboard, Notifications, Accounts (`/admin/users`), System Status (`/admin/system`) |
| PROPERTY_OFFICER | Dashboard, **Scan a Tag** (emphasized), Browse Items (`/items`), Requests, Notifications, New item, Categories (`/admin/categories`), Audit history, Reports |
| DEPARTMENT_HEAD | Dashboard, Browse Items (`/items?scope=all`), Department Requests, Notifications, Accounts (approvals tab via `approvals-count`) |
| STAFF | Dashboard, Browse Items (`/items?scope=mine`), My Requests (`/requests?mine=true`), Notifications |
| AUDITOR | Dashboard, Notifications, Active Audit (`/audit/new`), Audit history, Reports |

Badge types: `"pending-count"` (requests decision queue), `"approvals-count"` (account requests queue), `"unread-notifications"`. The badges self-gate via capability, not role-blind hardcode. In `AppLayout`, `badgeFor` handles all three.

### 7.2 Ruling on removed nav rows

`navConfig.ts` documents four intentionally removed rows (`/account-requests`, `/buildings`, `/admin/account-requests`, `/admin/system`-as-queue): those screens remain unbuilt, so the rows are removed. When you build any of them, re-add the nav row **and** the real screen in the same slice.
- The `Accounts` nav row on `/admin/users` is the shared DEPARTMENT_HEAD + SYSTEM_ADMIN surface — DEPARTMENT_HEAD sees the approvals tab only; invite/accounts tabs are SYSTEM_ADMIN-only.
- The `/admin/users` password-reset modal exists but **no button opens it** (dead UI — see Backlog F15).

### 7.3 Route table

Canonical route table lives in `frontend/src/app/router.tsx`. Guard semantics: anonymous → redirect to `/login?next=…`; wrong role → the shared 404 page; `mustChangePassword` → forced redirect to `/change-password` from every screen.

---

## 8. UI/UX standards — responsive, a11y, design tokens

**Both shells** (AauHeader shared chrome; desktop sidebar + sticky; below-`lg` bottom tab bar with up to 4 primary slots + "More" sheet overflows; body scroll-lock + body `--app-header-h` measured via ResizeObserver; safe-area inset for notched phones; skip-link + a11y discipline: focus-visible ring, focus to `<main>` on nav change, `aria-*`, "never colour-only" tone).

- **AAU brand tokens** live in `frontend/src/styles/tokens.css` (`@theme` compiled; `brand-*` mapped to AAU blue `#026CA9`, footer navy `#01324E`, `accent-*`/`danger-*` to AAU red). Fonts: Geist Sans (UI), JetBrains Mono (tag IDs/numbers), Noto Sans Ethiopic (Amharic wordmark).
- **AAU crest/gateLions** real assets live under `frontend/src/assets` and mirror in `frontend/src/components/aau` widgets (`AauHeader`, `AauFooter`, `AauLogo`, `PortalPageHeader`, `PortalTile` for saturated blue/gold action tiles).
- **Print styles scoped to `[data-print-tag]`**, for the QR sticker print path; `.tag-id` monospace identity class.
- **Mobile bottom-tab bar** uses `safe-area-inset-bottom` and count badges; overflow items live in the "More" sheet (still carrying their badges); the primary slots are the first ≤4 role-filtered nav items, so ordering in `NAV_ITEMS` determines what surfaces on phones.
- Amharic translations are not implemented yet (the `tokens.css` already carries `Noto Sans Ethiopic`); the font is ready, the strings are not.

## 9. Scope & visibility rules (authoritative — from `itemScope.ts` + `itemVisibility.ts`)

- `activeItemsWhere(extra)` **ALWAYS pins `status: "ACTIVE"` last** — a caller's `?status=DISPOSED` cannot widen it (asserted invariant; don't ever disable the pin-last).
- `allItemsWhere(extra)` is identity — its entire job is being greppable marker for "disposed items included ON PURPOSE" (only reports `GET /reports/disposals` uses it).
- A disposed item returns public 410 with `DISPOSED_PUBLIC_MESSAGE = "This item is no longer in service"` — quoted verbatim from acceptance criterion F7.3; do NOT change the string.
- Scope is computed by `itemListScope(actor)` — STAFF default: own holdings (`ownerId` OR `holderType=STAFF` + `holderId`); DEPARTMENT_HEAD: `orgUnitId IN (unitScopeIds subtree)`; an explicit `?scope=all` relaxes to no restriction.
- By-row `itemInScope(actor, item)` mirrors those list rules for by-ID/by-tag reads; out-of-scope reads yield **404** (never 403, never a partial leak).
- **SYSTEM_ADMIN sees zero items on `/items`** — deliberately mapped to `{ id: { in: [] } }`. Verified live 14 Oct. Maintain.
- Anonymous responses strip `cost` and custodian/holder identity via the `sanitizeItem` deny-list — but the current code still returns building/floor/room to anonymous callers (last open S1 gap, Backlog F10).

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
| Approval queue scoped (HEAD own unit / SYS_ADMIN fallback) | [DONE] | queue works live; the escalation fallback is currently a `[ESCALATED]` marker string inside `reviewNote` (Backlog F03) |
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
| Reports (inventory/disposals/audit/evidence-pack) | [PARTIAL] | the evidence pack was broken (it selected four fields that do not exist) and is fixed; the audit-session card now offers a **list of completed sessions** instead of asking for a raw id |
| Holdings export `GET /export/holdings` | [DONE route, no UI] | the route exists and is mounted (at `/api/v1/export` and `/export`) but nothing in either client calls it — spec §9.2 wants it as a dated personal-holdings CSV |
| Notifications + email stub | [PARTIAL] | in-app + `[CODE]-prefix` approach; email transport stub (console only); anything users "look for email" (reset link, invite) won't arrive |

### 10.2 Frontend (web)

| Area | Status | Notes |
|---|---|---|
| Route table + guards (5 roles) | [DONE] | `navRoutes.test.tsx` (17 tests) pass |
| Login + forced password change + change | [DONE] | 2-layer funnel (login redirect + RequireAuth catch-all) |
| Account request page | [PARTIAL] | the server intake was broken (500) and is fixed; the page still sends the department **name**, which the server now resolves to a unit — an id would be better |
| Invite acceptance | [DONE] | 3 designed states (no token / rejected token / form) |
| Dashboard per role (5 different branches) | [DONE] | role-scoped widgets + graceful fallbacks; AUDITOR branch verified; SYSTEM_ADMIN branch verified |
| Items browse (scope filter, URL-synced) | [DONE] | role-specific scope options per §9; skeleton/empty/offline states everywhere; the **scope is not counted as a filter**, so a scoped viewer with nothing gets "Nothing is assigned to you yet" rather than "no items match these filters — clear your filters" |
| Items create/edit | [DONE] | 409 disposed-mid-edit surfaced; photo upload with pending-photo slice; `isDirty` gating |
| Tag workbench (regenerate + accessories) | [DONE] | print/QR fine |
| Requests list + filters | [DONE] | window enum + URL-synced; fixed |
| Request detail + decision surface | [PARTIAL] | stage-2 dedicated control MISSING; custody-change line shows raw truncated hex — convert to "from HOLDER → to HOLDER" humanized line; SearchXIfNeeded() dead stub |
| Request form | [PARTIAL] | only TRANSFER/DISPOSAL enum — no LOAN type in the form |
| Audit screens | [DONE] | New (DEPARTMENT or BUILDING scope) + scan (QR + manual + 10s cooldown + sessionStorage walkthrough) + complete ConfirmDialog; audit-list filters CSV download |
| Audit abandon | [BROKEN] | ConfirmDialog opens → **fake success toast**, code walks `// TODO: Call abandon API endpoint when implemented` (line 90) |
| Audit report | [DONE] | instant summary from router state + breakdown from read-back; graceful download-failure copy |
| Reports page (4 tabs, CSV+PDF) | [DONE] | date-range presets computed client-side; range validation; `saveReport` |
| Admin users (approvals / invite / accounts tabs) | [PARTIAL] | three tabs; a System Admin lands on the accounts list and a Department Head on the queue. **No admin ever sets a password** — the dead "Change password" dialog is gone, replaced by "send a reset link" (the holder chooses the password). No pagination on the users slice. |
| Admin categories | [DONE] | delete refused with reason while `itemCount > 0` |
| System status page | [PARTIAL] | env/version/db rows **plus uptime and last deploy**, which the API always returned and the widget never showed; still no retry button and no OfflineState |
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
| A Department Head sees the staff requests of their own unit | [DONE — fixed 20 Oct] | the queue's "not escalated" filter dropped every row with **no** note, which is every **newly submitted** request (§13). The e2e flow now proves it against a real database. |
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
- backend **`GET /users/approvals` hid every newly submitted account request from the Department Head** (fixed 20 Oct). The filter was `reviewNote: { not: { contains: "[ESCALATED]" } }`, which Prisma renders as `reviewNote NOT LIKE '%[ESCALATED]%'` — **NULL** for a row with no note, and SQL drops NULL from a WHERE clause. A freshly submitted request has no note, so it never appeared in the head's own queue; only a SYSTEM_ADMIN could approve one. D1 (the unit head approves own-unit staff) was silently not happening, and every test was green because the mocked suite never executes the WHERE clause. Fixed with an explicit `OR: [{ reviewNote: null }, { reviewNote: { not: { contains: "[ESCALATED]" } } }]`. **The general rule this exposes: a `not: { contains }` filter on a nullable column hides the null rows — always write the null case explicitly.**
- backend `test-utils/index.ts` — uses `"ACCOUNT_ADMIN"` legacy maps
- **capability mirror drift — FIXED 20 Oct.** The web client was missing `SYSTEM_CONFIG`, `DISPOSAL_REVERSE` and DEPARTMENT_HEAD's `ITEM_READ_ALL`; the mobile client was missing `DISPOSAL_REVERSE` and DEPARTMENT_HEAD's `ITEM_READ_ALL`. All three matrices now agree, and `frontend/src/test/capabilityParity.test.ts` fails the build if they ever drift again (§3.1.1).
- backend `prisma/schema.prisma` no `updatedAt` — and migrate drift as per §4.2
- backend two divergent expiry services (expiry.ts vs expiryEscalation.ts) — same job, different config windows; consolidate
- frontend `frontend/api/preview.ts:87` — the social-preview function calls `GET /api/v1/items/:tagId` **anonymously**, with a comment asserting the route is public. It is not: `GET /items/:tagId` requires `authenticate` since 15 Oct, so the call returns 401 and **every shared tag link silently degrades to the generic card**. Fix: either give the preview function a server-side credential for a deliberately narrow public read, or drop the per-item preview and keep the generic card (decide, don't leave it silently broken).
- frontend `frontend/src/features/departments/DepartmentDetailPage` — hardcoded `Electronics`/`Furniture`/`Lab Equipment` fake category ID options ("1","2","3"); "Department Head" summary card shows the department name not a person; emerald/amber colors off-theme
- frontend `/catalog` orphan route + bogus card links; `DepartmentCatalogPage` unrouted dead page
- frontend **`/admin/system` is reachable by DEPARTMENT_HEAD** (`router.tsx` guards both `/admin/users` and `/admin/system` with `roles={["SYSTEM_ADMIN","DEPARTMENT_HEAD"]}`) but its data endpoint `GET /system/status` requires the `SYSTEM_CONFIG` capability (SYSTEM_ADMIN only) → a Department Head opening it gets a bare "Couldn't load system status" error page. Either restrict the route to SYSTEM_ADMIN or give the page a proper capability-aware state.
- frontend `/catalog` sits inside the all-roles shell → any signed-in role (including SYSTEM_ADMIN, who has no asset data) can reach it by URL, and it has no nav entry (orphan)
- frontend OverdueLoans widget + `useLoans` hooks + `api/loans.ts` never rendered (dead trio — re-wire to the PO dashboard to make overdue loans useful)
- frontend `AuditListPage` Abandon audit = fake success toast (line 90)
- frontend `MapPage` caption "Showing up to 100 items" — stale; paged whole register now
- frontend `AdminUsersPage` password-reset modal exists but never open — set dead UI (`setPasswordFor` never called)
- frontend `RequestFormPage` server error string-matching on `"pending"` is fragile
- frontend `SystemStatusPage` minimal with no retry / OfflineState
- frontend `AppLayout` stray odd formatting/`JSX` blocks outdented — works but sloppy
- frontend `.env.local` contains a live Vercel OIDC token sitting in an untracked local file — hygiene
- mobile `mobile/lib/widgets/status_badges.dart:160,169` — 2 stale `Role.accountAdmin` references (6-role era) → `flutter analyze` errors; the enum itself is correct 5-role
- mobile `mobile/lib/features/items/item_detail_view.dart:281` — hardcoded clipboard shared-link `https://cncs-pms.aau.edu.et/item/<tagId>` doesn't resolve (prod is vercel.app)
- backend **`services/expiry.ts` skipped the requests it existed for** (fixed 21 Oct). `if (!reviewerId) continue` — a request on an item in a unit with no head lands with nobody holding it, so it could never be escalated, nobody was told, and it sat in the queue forever. The destination is worked out from the request's type and its item, not from who holds it, so the guard was dropped. The same function also counted every stale request it *looked at*, including the ones it left alone, so the administrator's number did not mean what it said. Pinned by `backend/src/services/expiry.test.ts` (6 tests).
- backend **deleting an account failed with the database's own words** (fixed 21 Oct) — `DELETE /users/:id` deleted the user and its notifications, but not the account's `EmailToken` or its `AccountRequest`, so any account with an invitation or an application died on a foreign key with `{"error":"A referenced record does not exist"}`. The rows that belong to the account itself now go with it (its tokens, and its application while nobody has decided it); a *decided* application or an entry in the account log is part of the record and is refused in the route's own words, with the way out named ("Close the account instead").
- backend **`GET /items/recent` refused a staff member** (fixed 21 Oct) — it needed `ITEM_READ_ALL`, which STAFF does not hold, so the "recently registered" tile asked a staff member's dashboard for three rows of a register they may read, and was told 403. The scope rules lived inline in the list route, so the two item reads could disagree. They now live in one place (`resolveItemScope` in `backend/src/services/itemScope.ts`), used by the listing and by the tile, and the tile takes the same `?scope=`.
- frontend **the audit list's filter row overflowed sideways** (fixed 21 Oct) — five fixed-width filters on one line (`sm:flex-row` from 640px) need more room than a tablet has, so at 768 and 1024 pixels the row ran past the edge and the whole screen scrolled horizontally. The row now wraps (`xl:flex-row xl:flex-wrap`), and the same goes for the account log's and the department page's filter rows. `scripts/responsive-check.py` found it: 4 of 92 screens failed, and now 98 of 98 pass.
- backend **the seeded pending requests named nobody** (fixed 21 Oct) — every pending request was created without a `reviewedById`, so the escalation could not reach it and the queue showed requests with no one answerable for them. A pending request now names the head of the unit its item sits in, or the property officer when the unit has no head or the head filed it themselves.
- backend **a freshly seeded college changed its own state** (fixed 21 Oct) — fourteen of the thirty-three seeded pending requests were older than the seven-day escalation threshold, so the first administrator to run the expiry check moved them all to the property officer. The pending requests now wait inside the window, with one deliberate exception (`seed-req-head-cs-transfer-pending`, 9 days) so the demo can show an escalation.

---

## 14. Prioritized task backlog (checkboxes — tick with verification evidence)

Legend — priority: **P0** = blocking (deploy or required production correctness) · **P1** = core-flow gaps (features spec'd, expected soon) · **P2** = UX/polish/integrity · **P3** = later phase. Tick a checkbox ONLY on live-verified evidence; note evidence/citation and date next to it.

### 14.0 P0 — deploy/correctness (do BEFORE anything else)

- [x] **B01:** (21 Oct) migrations repaired (`20261013000000_materialize_account_tables`, `20261019000000_align_schema_with_datamodel`, `20261020000000_item_request_updated_at`, `20261021000000_audit_session_abandon`); applied to live Neon; `20261014000000_account_invite_fields` restored to its original checksum. Resolve migration drift + FAILED row: `prisma migrate resolve --rolled-back 20261012000000_phase_a_expand` on a **staging copy** first, then live. Consolidate on-disk `20261014000000_account_invite_fields` (currently un-applied) in the same deploy.
- [x] **B02:** (21 Oct) `updatedAt @updatedAt` on `Item` and `Request`, with the DB DEFAULT kept as the rollout bridge for the old deployed client. Add `updatedAt @updatedAt` to `Item` AND `Request` in a new migration; keep `Prisma` model-time fields consistent.
- [x] **B03:** (21 Oct) `routes/auth.ts` writes `orgUnitId` + `staffId`, resolves the unit by id or name, requires an active unit that accepts self-registration, creates the `AccountRequest` in the same transaction, and enforces the AAU domain allow-list. Fix `routes/auth.ts:131` — self-registration writes `orgUnitId` + `staffId` (never `User.department`); AAU email domain allow-list; same response on duplicate email; rate-limit route too.
- [x] **B04:** (21 Oct) the invite list and resend read the `EmailToken` (type INVITE) expiry, not a column that never existed. Fix `routes/users.ts` invite list/resend — replace `User.expiresAt` with the `AccountRequest`/`EmailToken` expiry mechanics (columns already exist in schema); join them for status rendering.
- [x] **B05:** (21 Oct) the evidence pack reads `reportNumber`/`sessionType`/`scopeType`/`scopeValue`/`results`. Fix `routes/reports.ts:630-658` — use actual AuditSession fields (`sessionType`,`reportNumber`,`scopeType`,`results[]`) for evidence pack.
- [x] **B06:** (21 Oct) LOAN is in `REQUEST_TYPES`, with a required future `loanDueDate`; the loan return handshake is implemented on web and mobile. Enable LOAN request intake — add LOAN to `REQUEST_TYPES`, add request fields (borrower claim tests, dueDate, condition), keep `approve` path in place.
- [x] **B07:** (21 Oct) `GET /loans/overdue` requires `LOAN_APPROVE`; the system administrator is refused it. Add requireCapability to `GET /loans/overdue` (PO only or capability match).
- [x] **B08:** (21 Oct) claim-with-correction, verify, flag and reverse-disposal are wired on the web (`ItemCustodyActions`) and on the phone. Wire claim-with-correction UI + verify-confirm/verify-flag UI + reverse-disposal UI on web AND mobile (detail page + handover screen).
- [x] **B09:** (21 Oct) the request form sends the selected unit's id. Fix the request-account page payload — stop sending a raw `department` name string; send the selected unit's id (`orgUnitId`) matching what the backend will accept after B03. Backend bug tracked separately in the §13 list.
- [x] **B10:** (21 Oct) register → head approves → sign in works, proved against the deployment by `scripts/live-verification-20.sh` (46 checks, 0 failures). Flow verify end-to-end: register applicant → head approves → sign-in works; paste real responses in the PR (the T-account flow was previously never proven against a real request path).
- [x] **B11:** (21 Oct) the phone's flows are in the live walkthrough (sign in, browse, request, withdraw, hand a loan back, accept an invitation). Verify the same e2e flows on mobile after B01–B10 land (login, browse, request, decide, claim, audit). Document any mobile-only blockers with reproduction steps.

### 14.1 P1 — flow feature completeness (spec'd, near-term)

- [x] **F01:** (21 Oct) `OverdueLoans` and `RecentlyRegisteredItems` are rendered on the property officer's dashboard. Wire OverdueLoans — re-attach the widget to the PO dashboard (currently a dead trio: unused widget + unused hook + unused API function).
- [ ] **F02:** Email verification — implement `POST /auth/verify-email` (single-use hashed token, per authority doc T4), make `PENDING_EMAIL_VERIFICATION` a real intake state, and add the verify-email page + sign-in pending/rejected/deactivated message states.
- [x] **F03:** (21 Oct) escalation is real: `APPROVAL_ESCALATION_DAYS` (7), a mark on the request, a notification with a link, and the count the administrator sees is the number that actually moved. A request nobody holds escalates too — it used to be skipped, which is what `backend/src/services/expiry.test.ts` pins. Real escalation status + `escalatedAt/ById` + `APPROVAL_ESCALATION_DAYS` (default 5) + lazy-on-read sweep.
- [ ] **F04:** Wire the `resolveApprover` head→parent→SYSTEM_ADMIN fallback into the approval queue route, and move the queue onto the `AccountRequest` model as the canonical flow (retire the legacy `User.accountStatus`-driven queue per D1).
- [ ] **F05:** `confirmedUnitId` honored only when the actor is SYSTEM_ADMIN (unit reassignment during approval) + write an AdminActionLog row for it.
- [ ] **F06:** Invite resend + revoke + an invite status list (SENT/RESENT/ACCEPTED/EXPIRED) with the escalation-window mechanics.
- [x] **F07:** (21 Oct) deactivation moves the holder's items to `REVERTED_UNVERIFIED`, writes the `HOLDER_DEACTIVATED` custody event, bumps `tokenVersion` and logs the action; a head may only close their own unit, and not a privileged role. Deactivation (T7): head deactivates own-unit STAFF with cause + trail — deactivate must move the person's held items to `REVERTED_UNVERIFIED`, write a custody `HOLDER_DEACTIVATED` event, bump `tokenVersion`, log to AdminActionLog. SYSTEM_ADMIN deactivates privileged accounts; another SYSTEM_ADMIN for a SYSTEM_ADMIN; self-deactivation blocked everywhere.
- [ ] **F08:** Out-of-scope tag lookup message: "Not assigned to you, contact Property Office" (spec F2).
- [x] **F09:** Three-way capability sync — the web and mobile matrices now match the backend exactly, and `frontend/src/test/capabilityParity.test.ts` fails the build on any drift (it was verified to fail when a grant is removed by hand).
- [x] **F10:** (21 Oct) the public tag read is gone — every item route needs a token, so there is no anonymous response to leak a location from. Strip remaining location leak (`building/floor/room`) from anonymous responses (last open S1 gap).
- [x] **F11:** (21 Oct) one file, `backend/src/services/expiry.ts`, answers every window. Consolidate the two divergent expiry services into ONE file; one configurable window framework everywhere (see §5.1 windows).
- [ ] **F12:** Buildings page — backend route exists; build the screen + nav row (PO only).
- [ ] **F13:** Add pagination to `GET /users`.
- [ ] **F14:** Decide + implement `mustChangePassword` retirement (legacy field) now that the invite/self-service flow exists.
- [ ] **F15:** Remove the dead admin password-reset UI (per C10 ruling: no admin ever sees or sets a password); replace with "admin triggers a reset-token email for the target user" — admin never sees the token.

### 14.2 P2 — UX / integrity / polish

- [x] **U01:** (21 Oct) the department page reads the real categories and the real head, and `/admin/departments` can add a department and appoint a head. Department detail fix — load real categories from the API (remove the fake "1"/"2"/"3" options), show the actual head person in the summary card (not the department name), use theme colors, and render the shared `NotFoundPage` instead of the inline Access Denied.
- [ ] **U02:** Remove the `/catalog` orphan route and the unrouted `DepartmentCatalogPage` dead page.
- [x] **U03:** (21 Oct) the custody line names the holders, the dead stub is gone, and the approval dialog is stage-aware (stage 1 releases, stage 2 hands over). Request detail — humanize the `fromHolder → toHolder` custody line; remove the `SearchXIfNeeded()` dead stub; add a stage-2 dedicated approval control (see §10.2).
- [x] **U04:** (21 Oct) `?item=<tagId>` preselects the item and the form reads the server's error structurally. Request form — pass the preselected item as `?item=<tagId>` structural payload and handle server errors structurally (remove the fragile string-match on `"pending"`).
- [ ] **U05:** Map — fix the stale "Showing up to 100 items" caption (the map now pages through the whole register, up to 50×100).
- [x] **U06:** (21 Oct) the status page shows the real uptime and build time and has an offline state. `SystemStatusPage` — retry button + OfflineState + surface uptime/lastDeploy.
- [x] **U07:** (21 Oct) `POST /audits/:id/abandon` with a required reason; the report page says Complete / Abandoned / In progress. Abandon audit — implement `POST /audits/:id/abandon` on backend + wire the UI to the real call.
- [ ] **U08:** OwnerSelect a11y/keyboard; replace the custom dropdown with the design-system `Select`.
- [ ] **U09:** `RequireAuth` — `loading` renders null (full-page blank); show a shared skeleton instead.
- [x] **U10:** (21 Oct) the shared link comes from the configured public origin. Mobile — fix the hardcoded shared-link origin in `item_detail_view.dart:281`; derive it from the configured API/env value.
- [x] **U11:** (21 Oct) the phone has an `/accept-invite` screen; the invitee sets their own password. Mobile — add an invite-acceptance screen (`POST /auth/accept-invite`) or explicitly document web-only acceptance for invited privileged users.
- [x] **U12:** (21 Oct) `/admin/system`, `/admin/events` and `/admin/departments` are the administrator's alone. `/admin/system` route — either restrict it to SYSTEM_ADMIN in the router, or make the page capability-aware so a DEPARTMENT_HEAD gets a clear "not available for your role" state instead of a failed fetch. (`/admin/users` correctly stays shared: approvals tab for heads, invite/accounts tabs for admins.)
- [ ] **U13:** Social preview — `frontend/api/preview.ts` calls the now-auth-required `GET /items/:tagId` anonymously → every shared tag link degrades to the generic card. Decide: a server-side credential for a narrow public read, or drop the per-item preview deliberately.
- [x] **U14:** (21 Oct) `.github/workflows/mobile.yaml` runs `flutter analyze` and `flutter test` on every push. Mobile CI workflow (`.github/workflows/mobile.yaml` does not exist — `flutter analyze` + `flutter test` are unrun in CI today, which is how the 2 stale `Role.accountAdmin` references survived).

### 14.3 P3 — growth (post-cutover)

- [ ] **G01:** Snapshot/frozen-at columns for reports — "frozen when official" is unimplemented today (`reportNumber` is the only freeze-ish column; no snapshot/frozen-at).
- [ ] **G02:** Bulk item import with optional image column (no route exists).
- [ ] **G03:** Amharic translations (frontend + mobile + backend emails); Noto Sans Ethiopic already in tokens.
- [ ] **G04:** Real email transport (Resend) + domain/DNS setup (supervisor decision §16.3).
- [ ] **G05:** Full push notif (FCM) — currently in-app inbox only
- [ ] **G06:** Reports: IFMIS/MoF fixed-asset format integration; consolidated evidence exports (aggregating multiple completed sessions; date-range)
- [ ] **G07:** Standing infra gaps never resolved: monitoring, DB backups, a real test database (all S1 from the gap analysis)
- [ ] **G08:** Admin review trail enforced at DB level: revoke UPDATE/DELETE on `AdminActionLog`, `CustodyEvent`, `AuditItemResultRow`, `ItemEditLog` via DB roles (append-only is "by convention" today).
- [x] **G09:** (21 Oct) `scripts/live-verification-20.sh` runs the whole table against the deployment: 20 rows, 46 checks, 0 failures. The one row that cannot be waited out (a request past the threshold) is proved in `scripts/e2e-flows.sh` by writing the creation date back. Run the full 20-row live-verification table (authority doc §4) against the merged app, one row per role, pasting real responses.

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

## 17. Live-verification checklist (20 rows — the account-approval acceptance suite)

Run these against a real deployment after the P0/P1 fixes. Paste the actual responses; a tick requires evidence. This is the table from `cncs-pms-account-approval-authority.md` §4 — the canonical acceptance set.

| # | Scenario | Expected |
|---|---|---|
| 1 | Biology applicant registers (+ verifies email once F02 lands) | Appears **only** in the Biology head's queue |
| 2 | CS head approves a Biology request | **404**, status unchanged |
| 3 | CS head lists approvals | CS requests only |
| 4 | Biology head approves | ACTIVE, unit = Biology, role = STAFF, AdminActionLog row written |
| 5 | Registration body contains `role: "SYSTEM_ADMIN"` | Ignored — created as STAFF |
| 6 | Register into Physics (no head) | Visible only to SYSTEM_ADMIN |
| 7 | CS head clicks "Not in my department" | Leaves the head queue; SYSTEM_ADMIN sees it |
| 8 | Pending user signs in | No session; pending message shown |
| 9 | Rejected user signs in | Rejection reason shown |
| 10 | STAFF calls any approvals endpoint | 404 |
| 11 | SYSTEM_ADMIN invites a head without `authorizationRef` | 400, nothing created |
| 12 | SYSTEM_ADMIN invites a head with a valid authorization | Invite created; AdminActionLog carries `authorizedBy` + ref |
| 13 | Invite a second head for a unit that has one | 400 |
| 14 | Invite the same person as Property Officer + Auditor | 409 |
| 15 | SYSTEM_ADMIN approves their own account | Rejected |
| 16 | Head deactivates staff; the old token is reused | 401; the staff's items become `REVERTED_UNVERIFIED` |
| 17 | Head tries to deactivate another head | 404/403, no change |
| 18 | A request stays pending past the escalation threshold | SYSTEM_ADMIN notified and able to decide |
| 19 | Invitee opens an expired/used link | Clean error, no account created |
| 20 | Click every nav item for all 5 roles | No "Page not found" anywhere |

---

### 17.1 The scripts that prove it (21 Oct)

| Script | What it proves | Where it runs |
|---|---|---|
| `scripts/e2e-flows.sh` | 48 checks against a **real database** built from the migrations and seeded: the account-approval flow, the scope rules, the workflows, the expiry and report surfaces, the audit surfaces, and a request that waits past the threshold and is escalated. | `.github/workflows/e2e.yaml`, and locally against a throwaway Docker Postgres. |
| `scripts/live-verification-20.sh` | the **twenty rows of §17** against the running deployment — who sees whose queue, who may approve what, what an unauthorized invitation does, whether a closed account can sign in. It creates the accounts it needs and closes them afterwards. | against `https://cncs-pms-api.vercel.app` (the login endpoint is rate limited to 10 per IP per 15 minutes, so the tokens are cached for a day). |
| `scripts/live-walkthrough.sh` | 45 checks against the deployment: every role signs in, the scope rules hold, the account-approval flow works, the refusals are refusals. | as above. |
| `scripts/responsive-check.py` | the screens in a real Chromium at 390 / 768 / 1024 / 1440 — they render, nothing overflows sideways, the tap targets are big enough, no request is refused. | as above. |
| `scripts/check-api-contract.mjs` | every call the web client makes has a matching route on the server (96 of 96), and the other way round (the server declares 204 routes; 141 have no web caller — most are the mobile-only or admin-only ones). | `.github/workflows/frontend.yaml`. |

**The two rules they taught.** A check that needs a week of waiting is proved
by writing the date back, not by waiting — and a check that needs the
database is proved against a real database, not against a mocked suite (the
mocked suite said the approval queue worked, and it did not).

### 17.2 The two open decisions, now closed (21 Oct)

**The legacy objects (P2-7) — decided: gone, except one that stays on purpose.**

The contract migration (`20261019000000_align_schema_with_datamodel`) already
did most of it. The live database has **no `Department` table**, **no
`Item.department`**, **no `Item.building`** and **no `User.departmentId`**
(verified against the live Neon database, 21 Oct). What is left is
`Item.ownerId`, and it **stays**:

- the scope rules read it — `itemListScope` finds a person's own items by
  `ownerId` *or* by the holder fields, so an item somebody owns without
  holding it is still in their list;
- the item form writes it — "Owner (custodian)" is a real field a person fills
  in, not a leftover;
- dropping it is not a cleanup but a **contract step**: every item would need
  a holder before the column could go, and the holder model is not complete
  for the historical rows.

So: the free-text columns and the old table are gone, and the one column
that is still read and still written is kept, with the reason written here
rather than in a comment nobody finds.

**The `updatedAt` default (P2-9) — decided: keep it.**

The bridge was there for the *old deployed Prisma client* — the server build
that does not know the column exists and therefore sends no value for it.
That build is gone from the deployment, but **Vercel keeps the previous
deployment and can roll back to it**, and a rollback to a pre-`updatedAt`
build with the default dropped would fail every insert of an item or a
request — the whole app, in one migration.

The default costs one column default and buys the ability to roll back
without thinking about it. That is a good trade, so the default stays, and
the reason is written here: the condition for dropping it is "the deployment
can no longer be rolled back to a build that predates the column", which is
not a condition anyone can schedule.

## 18. Schema design decisions — do NOT re-open without a written reason

| Decision | Rationale |
|---|---|
| 5 roles (`ACCOUNT_ADMIN` merged into `SYSTEM_ADMIN`) | Decided 12 Oct; the whole permission matrix and 500+ tests are built on it |
| Staff self-registration approved by the **unit head** (D1) | Decided & final (§3.2) |
| Privileged roles are **invite-only** (D2) | The appointing authority sits outside the system; we record it, we don't replace it |
| Every privileged invite records `authorizedBy` + `authorizationRef` (D3) | The college office / Office of Auditors authorizes; the app is the record, not the authority |
| A SYSTEM_ADMIN account is created/approved by a **different** SYSTEM_ADMIN (D4) | No self-approval anywhere |
| Holder model (`holderType`/`holderId`) over `ownerId` | `ownerId` is legacy, still dual-written during the expand→contract migration; the holder pair is the truth |
| Disposal = **single** approver (Property Officer) for phase 1 | Two-approver threshold is a finance-policy decision (open, §16) |
| **No public item routes** | All item reads require auth; anonymous sees only category/building |
| `POST /auth/register` removed | Replaced by self-request + invite; no admin ever sets a password |
| Audit scope is **frozen at session start** (PENDING rows) | Completion computes against the frozen set, never a fresh query |
| Append-only logs (`AdminActionLog`, `CustodyEvent`, `ItemEditLog`) | Never UPDATE/DELETE; DB-level enforcement is still open (G08) |
| JWT 1-day expiry, no refresh token | Accepted limitation, mitigated by `tokenVersion` bumps on credential/role change |
| QR tag URL = `${PUBLIC_BASE_URL}/item/:tagId` | Baked in at print time — changing `PUBLIC_BASE_URL` after printing dead-ends every existing sticker, and CI cannot detect it |

## 19. Code conventions (follow these — they keep the three clients in step)

**Backend**
- Every route handler gates with `requireCapability` / `requireAnyCapability` — never branch on role names inside handlers.
- Field filtering happens server-side via `sanitizeItem` (`utils/filterItemFields.ts`) — never in the client.
- Every state-changing route writes its append-only log row **in the same transaction** as the mutation.
- `HttpError` for predictable error shapes; zod `validate(schema)` middleware for body/query/params.
- Dual-mount pattern `app.use(["/api/v1/X", "/X"], router)` — keep until clients are canonical, then drop the alias.

**Frontend**
- All API calls go through `lib/apiClient.ts` — never a bare `fetch` (it guarantees the Bearer token, error normalization, and the single 401 handler).
- `lib/permissions.ts` decides what to **render**; the server decides what is **allowed**. Never render a field the server did not send — its absence is the access control.
- `ASSET_ROLES` = everyone except SYSTEM_ADMIN; use it rather than re-deriving the rule.
- Wrong role → the shared 404 page (no separate 403 page).
- Every mutation invalidates the affected TanStack Query keys and toasts the outcome.
- Dates are UTC; label date-range inputs as UTC.
- Photos are URLs until `POST /uploads/photo` is called; `PhotoField` handles camera / file / pasted URL.

**Mobile**
- All calls through `lib/core/api/api_client.dart` (dio + Bearer interceptor + 401 handling).
- `lib/models/permissions.dart` mirrors the backend matrix exactly (§3.1.1 — today it is 2 capabilities behind).
- `lib/app/router.dart` uses go_router; capability-gated routes 404 instead of 403.

---

## 20. Seed data reference (verified against the seeded database, 20 Oct)

`cd backend && pnpm prisma:seed` — **idempotent**: running it twice leaves every row count identical, and it converges (a demo account forced back to `PENDING_EMAIL_VERIFICATION` comes back `ACTIVE` with a working password).

**Every individual has enough data to exercise their role:** each staff member holds 5–8 items and has 5–7 requests of their own; each department head holds 6 and has 4. The seeded state covers all nine request states, seven item statuses, and the account-approval states.

| Role | Email | Password | Notes |
|---|---|---|---|
| SYSTEM_ADMIN | `admin@cncs.aau.edu.et` | `Admin123!` | holds nothing, by design |
| PROPERTY_OFFICER | `officer@cncs.aau.edu.et` | `Officer123!` | holds the college pool |
| DEPARTMENT_HEAD (CS) | `head.cs@cncs.aau.edu.et` | `HeadCS123!` | |
| DEPARTMENT_HEAD (Biology) | `head.bio@cncs.aau.edu.et` | `HeadBIO123!` | |
| DEPARTMENT_HEAD (Chemistry) | `head.chem@cncs.aau.edu.et` | `HeadCHEM123!` | |
| STAFF (CS) | `staff.cs1@` / `staff.cs2@` / `staff.cs3@cncs.aau.edu.et` | `StaffCS123!` | |
| STAFF (Biology) | `staff.bio1@` / `staff.bio2@cncs.aau.edu.et` | `StaffBIO123!` | |
| STAFF (Chemistry) | `staff.chem1@cncs.aau.edu.et` | `StaffCHEM123!` | |
| AUDITOR | `auditor@cncs.aau.edu.et` | `Auditor123!` | |
| AUDITOR (invited, not yet accepted) | `auditor2@cncs.aau.edu.et` | — | `PENDING_EMAIL_VERIFICATION` + an outstanding invite token — exercises the invite list, resend and accept flows |
| PENDING (CS) | `pending.cs@cncs.aau.edu.et` | `Pending123!` | in the CS head's queue |
| PENDING (Biology) | `pending.bio@cncs.aau.edu.et` | `Pending123!` | in the Biology head's queue |
| PENDING (Physics — no head) | `pending.phys@cncs.aau.edu.et` | `Pending123!` | visible only to SYSTEM_ADMIN |
| PENDING (new) | `newstaff.cs@cncs.aau.edu.et` | `Pending123!` | a second CS request, so the queue has more than one row |
| ESCALATED | `escalated.cs@cncs.aau.edu.et` | `Pending123!` | escalated by the CS head — only SYSTEM_ADMIN sees it |
| REJECTED | `rejected.chem@cncs.aau.edu.et` | `Pending123!` | declined with a readable reason |

> The generic `staff@cncs.aau.edu.et` and `dept.head@cncs.aau.edu.et` accounts are **not** created by the seed (they were listed in an earlier version of this table — they never existed). Use the real accounts above.

**Departments:** Computer Science (head), Biology (head), Chemistry (head), **Physics (no head — exercises the vacant-head fallback to SYSTEM_ADMIN)**.

**Seeded shape** (from a real seeded database): 19 users · 99 items · 79 requests across all nine states · 13 audit result rows (FOUND / MISSING / LOCATION_MISMATCH / PENDING) · 2 audit sessions (one completed with a report number, one active) · 45 notifications of several kinds · 7 account requests · 1 outstanding invite · 4 buildings · 5 categories · 5 org units.

**Item tag series:** `CNCS-DEMO-0001…0020` (the college pool) and `CNCS-STAFF-0001…0079` (per-individual holdings) — every tag matches `^CNCS-(DEMO|STAFF)-\d{4}$`.

---

## 20.1 The open questions, answered

The role report asked four questions that are design decisions rather than defects. They are answered here so the next person does not have to guess.

**1. Should the Property Officer have the audit history?**
Yes. An officer acts on what an audit finds — the findings list is on their dashboard and a finding without the session that produced it is not actionable. The officer **reads** the history (`AUDIT_VIEW`); they do not **run** sessions (`AUDIT_RUN` is the auditor's alone). The nav already draws that line: "Audit history" for the officer, "Active Audit" for the auditor.

**2. Should the auditor have notifications, and of what kind?**
Yes, and of three kinds only — the ones that concern an auditor's work:
- an audit session was **completed** by somebody else (so they can check the result);
- an item was **flagged** for review (spec §5.3's flag path);
- a finding was **confirmed lost** (the loss record exists).
An auditor does not need to be told that an account was approved. The seed does not create auditor notifications today; the notifications service does not emit audit events to auditors either. **This is open work (P3), not a decision against it.**

**3. Which roles get which reports?**
| Role | Reports | Scope |
|---|---|---|
| PROPERTY_OFFICER | inventory, disposals, audit session, evidence pack | the whole college |
| DEPARTMENT_HEAD | inventory and disposals for their department | their unit |
| AUDITOR | inventory, disposals, audit session, evidence pack | the whole college (read-only) |
| SYSTEM_ADMIN | **none** | — an account role does not get asset data |
| STAFF | **none** | — they see their own items, which is not a report |

`REPORT_VIEW_ALL` is held by the officer, the head and the auditor, and the *scope* is decided by the report, not by a second capability. The web's Reports page is a property officer's and an auditor's; a department head's departmental reports are still to be built.

**4. What happens when the person who holds the account, or the head of the department, leaves?**
The handover is the answer, and it already exists in code — what was missing was that it was not obvious, and that the account was never closed.

- **A staff member leaves.** The administrator **deactivates** the account (`POST /users/:id/deactivate`): the account stops being able to sign in (`tokenVersion` is bumped, so every session dies), the items they held move to `REVERTED_UNVERIFIED` and a custody `HOLDER_DEACTIVATED` event is written. The items are **not** given away to somebody else automatically: the department head confirms them one by one, and until they do, the item cannot be transferred or disposed of.
- **A department head leaves.** The administrator **appoints the new head** (`POST /org-units/:id/activate-head`): the unit's held items move to `REVERTED_UNVERIFIED` and the new head verifies each one. The old head's **personally held** items are *not* moved to the new head — a role change never silently moves personal custody; they stay with the person until that person hands them over or is deactivated.
- **Who replaces them?** The administrator appoints. There is one head per unit (`OrgUnit.headId` is unique) and one unit per head.

**The gap that is still open:** the deactivation and head-appointment screens are not built (the endpoints are), and the deactivation does not yet write the AdminActionLog row the append-only rule requires. Both are in `MASTER-TODO.md`.

---

## 21. Conflict rulings ledger (every known doc conflict, resolved once)

The 20 Oct audit found 19 places where two "current" documents disagreed. Each is ruled here; the losing statement is not repeated anywhere else in this file.

| # | Conflict | Ruling |
|---|---|---|
| C1 | D1 approval authority: "decided & final" vs "still open" | **D1 is decided** (§3.2): the head of the applicant's unit approves own-unit staff; SYSTEM_ADMIN is the fallback only. |
| C2 | Does SYSTEM_ADMIN see `/requests` rows? | **No.** SYSTEM_ADMIN sees zero asset rows on every asset endpoint (§9). Re-verify per release — a 14 Oct live check showed a leak on the then-deployed revision. |
| C3 | Is `canDecide` wired into the decision handlers? | **Yes** — approve/reject/escalate all call it. The *unwired* one is `resolveApprover` (head→parent→SYSTEM_ADMIN fallback), which exists and is tested but is not called by any route → Backlog F04. |
| C4 | Route-shadowing fix state | The literal routes (`/items/recent`, `/items/held-by-me`, `/audits/active`, `/audits/findings`) are registered ABOVE their `:param` siblings — verified in the current tree. A regression test pins it; do not reorder. |
| C5 | Is `AdminActionLog` ever written? | **Yes** — invite/resend/accept (invites service) and approve/reject/escalate (users.ts) write it. Old "never written" claims are stale. Append-only is still not DB-enforced (G08). |
| C6 | Does a void route exist? | **Yes** — `POST /items/:id/void` exists, unit-tested; no e2e flow verification yet. |
| C7 | Must `GET /items` require auth? | **Yes** — hard `authenticate` since 15 Oct; no anonymous downgrade. The remaining question (what an anonymous visitor sees at `/items` in the web shell) is a UX decision → §12 + Backlog. |
| C8 | Is by-id scanning scope-checked? | **Yes** — `itemInScope` is applied before the row is returned; out-of-scope → 404. |
| C9 | Must pending approvals be reassigned to a new head? | **No per-approver queue exists** — the queue is derived from status + unit on read, so a head change is automatically reflected. Reassignment is therefore unnecessary; only a log line is meaningful. |
| C10 | May an admin set/reset another user's password? | **No.** The workflow-spec rule wins: no admin of any role ever sees or sets a password. The dead admin-reset UI is removed; the only path back in is a token-based reset (F15). |
| C11 | Item state names (`REGISTERED/ASSIGNED/IN_USE/IN_STORE/UNDER_REPAIR`) vs the schema enum | **The schema enum is canonical** (§4). The old names do not exist and must not be reintroduced. |
| C12 | Single-step loan return vs three-endpoint handshake | **The handshake wins** (`return-initiate` → `return-confirm` or `return-dispute`); the old single-step endpoint is superseded and now unused |
| C13 | `WAITLISTED` vs `INVALIDATED` | **Both, with distinct triggers**: `WAITLISTED` = a competing request lost to one that was granted; `INVALIDATED` = the request's premise disappeared (the item's status changed outside the request). §5.2. |
| C14 | Deployment facts (auto-deploy vs manual CLI; which revision is live) | **Personal repo `main` is the deploy source**; production state is whatever Vercel last built from it. Never infer the live revision from a "Ready" badge — prove it behaviourally (§14 B10). |
| C15 | Does `POST /auth/register` exist? | **No — removed** 14 Oct. Registration is: self-request (STAFF) or invite (privileged). |
| C16 | Self-registration endpoint name and fields | The endpoint is `POST /auth/account-requests`; the spec'd name (`/auth/request-account`) and the `staffId` + `PENDING_EMAIL_VERIFICATION` fields are **still to be added** (B03/F02). |
| C17 | Which nav list is right? | The KB's §7.1 list (monolithic §13 shape + the Accounts row for DEPARTMENT_HEAD). The authority doc's §3.2 table is stale. |
| C18 | Which docs are "current"? | This KB + the 6 files listed in `docs/README.md`. Everything else is archive. |
| C19 | Do `[DONE]` labels mean "done in production"? | **No** — they mean done in code + wired. Production status is tracked separately via live verification evidence (P0/P1 tasks require pasted responses). |

---

## 22. Branch reconciliation & deployment plan (Yanet's `lalu-branch` vs our `main`)

**Situation:** `Hayredin950/main` (verified, 531 backend tests green, frontend build green) carries the whole workflow-completeness spec and the UI fixes. `yanetgeleta/lalu-branch` carries Yanet's "new master plan 3, staff signup, phase one" work, which is not in `main`, so a PR from `lalu-branch` → `main` is not mergeable (both sides moved).

**Do NOT force-push over his work.** Plan:

1. **Inventory his diff first** — `git fetch origin lalu-branch` then `git diff --stat main..origin/lalu-branch` per top-level folder. The goal is to learn *what* is new (new pages? new routes? new schema?) before deciding.
2. **Classify each hunk** into: (a) already in our `main` (drop), (b) genuinely new and wanted (port), (c) conflicting with KB rulings (reject with a written reason).
3. **Schema first** — if his branch touches `schema.prisma` or `prisma/migrations/`, that is the highest-conflict, highest-risk area (§4.2). Port schema changes as a separate reviewed slice, on a fresh branch, before any code that depends on them.
4. **Port order:** backend routes/services (+ their tests) → frontend API/hooks → frontend pages → mobile. One slice per concern, each green on both CI workflows.
5. **Re-verify the 5-role walkthrough** after the merge (§15 DoD) — the merge is exactly where "admin can see asset data" regressions come from.

**Deployment checklist for the merged result** (in order):
1. `pnpm exec prisma migrate deploy` (uses `DIRECT_URL`, unpooled) — only after B01 (FAILED-row resolve) and the `updatedAt` migration.
2. `pnpm prisma generate` (Prisma 7 does NOT do this on postinstall — it must be explicit in the Vercel build command).
3. `pnpm prisma:seed` (idempotent; prints demo credentials).
4. Deploy API → verify `GET /health` and one authenticated endpoint by real HTTP.
5. Deploy web → verify `/login`, then the 5-role walkthrough.
6. Record the deployed commit SHA in this file's §23 log.

**Environment variables** (backend): `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon unpooled), `JWT_SECRET`, `PUBLIC_BASE_URL` (**the FRONTEND origin — it is baked into every printed QR sticker; changing it after printing dead-ends every sticker and CI cannot detect it**), `UPLOADS_DIR=/tmp/uploads`, `NOTIFY_EMAIL=false` (stub transport), `CLOUDINARY_CLOUD_NAME/ API_KEY/ API_SECRET` (omit → uploads 503 and the form falls back to a pasted URL), `CORS_ORIGINS` (**required in production; fails closed without it**).
**Frontend**: `VITE_API_BASE_URL` (inlined at BUILD time), `API_BASE_URL` (runtime, for the social-preview function), optional `VITE_SITE_ORIGIN`.

---

## 23. Doc-changes log

| Date | Change | Ruling |
|---|---|---|
| 20 Oct | Initial KB issued | Consolidated from 37 docs + 4 code audits (backend, frontend, mobile, docs). C1–C19 conflicts ruled in §21. Capability drift measured in §3.1.1. Backlog in §14. |
| 20 Oct | `docs/README.md` active set rewritten | KB is now the single authority; the other 6 files are detail/incident history. |
| 20 Oct | `backend-audit-2026-10-20.md` (was root `BACKEND_AUDIT.md`) | Moved into `docs/`; referenced from §4 and §6. |
| 20 Oct | **End-to-end flow check** (`scripts/e2e-flows.sh`, 42 checks, run in `e2e.yaml`) added — and it found the approvals-queue bug on its first run: `reviewNote NOT LIKE '%[ESCALATED]%'` is NULL for a row with no note, so a Department Head never saw a newly submitted account request and only a SYSTEM_ADMIN could approve one. D1 was silently not happening. The general rule is now written down: **a `not: { contains }` filter on a nullable column hides the null rows**. |
| 21 Oct | **The twenty-row table was run against the deployment** (`scripts/live-verification-20.sh`, new): 20 rows, 46 checks, 0 failures. It found three real bugs, all fixed — the escalation skipping the requests nobody held, the account delete dying on a foreign key, and the "recently registered" tile refusing a staff member (§13). The one row that cannot be waited out (a request past the seven-day threshold) is proved in `scripts/e2e-flows.sh` by writing the creation date back and running the real service. |
| 21 Oct | **The item scope rules moved into one place.** `resolveItemScope` (`backend/src/services/itemScope.ts`) now answers both the listing and `GET /items/recent`, so the two cannot disagree again — the disagreement is what made the tile refuse a staff member. |
| 21 Oct | **The mobile dashboard shows "My holdings" and asks the server for three rows** of the recent list instead of downloading a page of twenty. The tile asks for the same scope its register screen uses. |
| 20 Oct | Cross-checked against the **external** `MASTER_KNOWLEDGE_BASE.md` (a parallel knowledge base produced by another agent, kept at `~/Documents/`) | Its **migration-order table** was correct → merged (§4.2). Its **20-row live-verification table** → merged as §17. Its route inventory was used to cross-check §6, which caught one error in *this* file (`GET /export/holdings` was wrongly recorded as "no route" — it exists and is mounted, just without a UI caller). Claims that did **not** survive verification were rejected: `POST /expiry/run` (real: `/expiry/check`), "mobile missing all `ACCOUNT_*`" (mobile has them), "frontend mirror verified" (it is **not** — §3.1.1), "transfer/loan handshakes still missing" (both are implemented in code now). Two findings it surfaced that were not previously recorded: the broken social-preview call (§13) and the missing mobile CI workflow (U14). |

**How to use this file:** §3–§9 are the *rules* (don't change them without a ruling), §10–§13 are the *measured state* (refresh after each change), §14 is the *work list* (tick with evidence), §21 is the *conflict ledger* (append a row when a new conflict appears), §22 is *operations*.
