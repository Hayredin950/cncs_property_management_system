# CNCS PMS — Department-Scoped Registration, Approval Hierarchy & Role Flow
### Agent task list with detailed actions

Audience: the coding agent working on `cncs_property_management_system` (backend, web frontend, mobile).
Source documents: `cncs_pms_revised_plan_v2.md` (v2 spec), `full-work-plan-and-roadmap.md` (12 Oct decisions),
`property-hierarchy-and-roles-plan.md`, `supervisor-feedback.md`, `role-based-ui-backend-handoff.md`.

---

## 0. Ground rules (read first, apply to every task)

1. **Nothing is "done" until verified live.** Unit tests passing is necessary, not sufficient. For every task,
   the final step is an HTTP call (curl/Postman/script) and a browser click-through as the relevant role.
   Report real status codes and screenshots-in-words, not "all tests pass".
2. **Server decides, client displays.** Approver resolution, scope filtering, and role assignment are computed on
   the server only. Never trust `role`, `departmentId`, or `approverId` sent by a client.
3. **Backend and frontend ship together.** Each task lists the endpoint, the screen, and the test. Do not merge a
   backend change whose UI is missing, or the reverse.
4. **Nav, route guards and server capabilities must agree.** A nav item that opens "Page not found" is a bug.
   A route reachable by URL but hidden from nav is also a bug unless the server refuses it.
5. **Cross-scope access returns 404, not 403**, so existence of other departments' records is not revealed.
6. **No hard deletes. Logs are append-only.** Log every approval, rejection, escalation, deactivation, invite.
7. **Single permission source.** Use `requireCapability()` and `backend/src/services/permissions.ts`; mirror in
   `frontend/src/lib/permissions.ts` and `mobile/lib/models/permissions.dart`. Do not branch on role names in
   screens.
8. **Report format for each finished task:** what changed (files), how it was verified (exact commands/calls and
   responses), anything left unverified.

---

## 1. Decisions this plan assumes (confirm with Yanet / supervisor; defaults shown)

| ID | Decision | Default used in this plan |
|---|---|---|
| D1 | Who approves staff self-registration | **Head of the applicant's selected department.** SYSTEM_ADMIN is fallback (vacant head, wrong department, stale request). This overrides the 12 Oct "SYSTEM_ADMIN approves everything" decision. |
| D2 | Who creates privileged accounts | SYSTEM_ADMIN invites Heads, Property Officer, Auditors, other SYSTEM_ADMINs. Never self-registered. |
| D3 | Org tiers live in phase 1 | College → Department only, but modelled as a generic `OrgUnit` tree so later tiers are rows, not rewrites. |
| D4 | Escalation threshold for stale pending requests | **Open** — configurable value `APPROVAL_ESCALATION_DAYS`, default 5. |
| D5 | Email domains accepted at registration | AAU addresses only (`@aau.edu.et` and `@cncs.aau.edu.et`), configurable list. |
| D6 | Department head sees department items | Yes: own items + all items held by the department and its staff (spec §2.4). |

If D1 is rejected, tasks marked **[D1]** collapse to "SYSTEM_ADMIN is the only approver"; everything else holds.

---

## 2. Target model in one page

- Every person belongs to **one org unit**. Every unit has **at most one active head**.
- Approvals go to **the head of the requester's own unit**. Peers never cross.
- `resolveApprover(unit)` → active head of `unit`; else head of `unit.parent`; else SYSTEM_ADMIN.
- Self-registration creates **STAFF only**. Privileged roles come by invite.
- Account states: `PENDING_EMAIL_VERIFICATION → PENDING_APPROVAL → ACTIVE | REJECTED | DEACTIVATED`.
- Scope of what a user sees:

| Role | Items visible | Accounts visible |
|---|---|---|
| STAFF | Items they personally hold | none |
| DEPARTMENT_HEAD | Own + department-held + staff-held in their unit (and child units) | Pending requests of their own unit |
| PROPERTY_OFFICER | Entire college | none |
| AUDITOR | Items in frozen scope of an active audit | none |
| SYSTEM_ADMIN | **No asset data** | All accounts, escalations |

---

## 3. PHASE A — Data model (do first; everything depends on it)

### A1. Org unit tree
- [ ] Add `OrgUnit` to `backend/prisma/schema.prisma`: `id`, `name`, `code` (unique), `type` enum
      (`COLLEGE`, `DEPARTMENT`, `GROUP`, `OFFICE`), `parentId` (self-relation, nullable), `headUserId`
      (nullable, FK User), `acceptsSelfRegistration` (bool, default true for DEPARTMENT/GROUP),
      `active` (bool).
- [ ] Decide migration path with the existing `Department` table: **either** rename/extend `Department` into
      `OrgUnit` **or** keep `Department` and add `OrgUnit` pointing at it. Prefer one table. Write the choice
      and reasoning in the PR description.
- [ ] Constraint: a unit's head must be a user whose `unitId` is that unit (or a child). Enforce in service
      layer and a DB check where possible.
- [ ] Constraint: one user can be head of at most one unit.

### A2. User fields
- [ ] `User.unitId` (FK OrgUnit, required for STAFF and DEPARTMENT_HEAD; null for SYSTEM_ADMIN/AUDITOR/PO as
      appropriate — PO may be bound to the college unit).
- [ ] `User.staffId` (string, unique, required for STAFF self-registration).
- [ ] `User.accountStatus` enum: `PENDING_EMAIL_VERIFICATION`, `PENDING_APPROVAL`, `ACTIVE`, `REJECTED`,
      `DEACTIVATED`. Keep `tokenVersion`. Remove `mustChangePassword` (per spec §3.3.7) only after the
      invite flow in Phase G replaces it.
- [ ] Replace any free-text `department` string on User/Item/Request with FK references. Write a migration that
      maps existing strings (e.g. "Computer Science") to unit rows; list unmatched strings in the migration
      output instead of silently dropping them.

### A3. Registration request & approval records
- [ ] `AccountRequest` table (or reuse User with status — pick one and document): `id`, `userId`,
      `requestedUnitId`, `confirmedUnitId` (nullable until decision), `status`, `submittedAt`,
      `decidedAt`, `decidedById`, `decisionNote`, `rejectionReason`, `escalatedAt`, `escalatedById`,
      `escalationReason`.
- [ ] `EmailToken` table: `id`, `userId`, `type` (`VERIFY`, `INVITE`, `RESET`), `tokenHash`, `expiresAt`,
      `usedAt`. Tokens stored **hashed**, single use.
- [ ] `AdminActionLog` (append-only): `actorId`, `action`, `targetUserId`, `unitId`, `before`, `after`,
      `createdAt`. Revoke UPDATE/DELETE at DB level if the DB supports it.

### A4. Seed data (needed for verification)
- [ ] One seed script, one reset command. Create: College CNCS; departments **Computer Science, Biology,
      Chemistry, Physics** (Physics intentionally has **no head**).
- [ ] Per department with a head: 1 DEPARTMENT_HEAD, 2 STAFF, 4–6 items held by head/staff/department.
- [ ] Users: `sysadmin@`, `officer@`, `auditor@`, `head.cs@`, `head.bio@`, `head.chem@`, `staff.cs1@`,
      `staff.cs2@`, `staff.bio1@`, `staff.bio2@`, `staff.chem1@` plus a few pending requests per department.
- [ ] Hard rule in the script header: no real staff or student data ever enters seed.

**Acceptance for Phase A:** `prisma validate` clean; migration applies on a fresh DB **and** on a copy of the
current dev DB; seed produces the structure above; `SELECT unit, count(*)` shows 4 departments with the stated
heads/staff counts.

---

## 4. PHASE B — Permissions and approver resolution

### B1. Capabilities
- [ ] Add capabilities in `permissions.ts`:
      `ACCOUNT_APPROVE_OWN_UNIT` (DEPARTMENT_HEAD), `ACCOUNT_APPROVE_ANY` (SYSTEM_ADMIN),
      `ACCOUNT_INVITE` (SYSTEM_ADMIN), `ACCOUNT_DEACTIVATE_OWN_UNIT` (DEPARTMENT_HEAD → STAFF only),
      `ACCOUNT_DEACTIVATE_PRIVILEGED` (SYSTEM_ADMIN), `UNIT_ITEMS_READ` (DEPARTMENT_HEAD).
- [ ] Mirror every new capability in `frontend/src/lib/permissions.ts` and `mobile/lib/models/permissions.dart`.

### B2. `resolveApprover`
- [ ] Create `backend/src/services/approvers.ts` with:
      `resolveApprover(unitId): { type: 'HEAD' | 'PARENT_HEAD' | 'SYSTEM_ADMIN', userId?: string }`.
- [ ] Rules: active head → use; head vacant or head account not `ACTIVE` → parent unit's head; none → SYSTEM_ADMIN.
- [ ] A user can never be the approver of their own request (maker ≠ checker).
- [ ] `canDecide(actor, request)` helper used by **every** approve/reject/escalate handler: SYSTEM_ADMIN always
      allowed; DEPARTMENT_HEAD allowed only if `request.requestedUnitId` equals actor's headed unit (or a
      child of it) **and** actor is `ACTIVE`.
- [ ] Unit tests: head of unit, vacant head → parent, vacant everywhere → SYSTEM_ADMIN, deactivated head
      skipped, self-approval blocked.

---

## 5. PHASE C — Registration backend

### C1. `GET /departments` (public, minimal)
- [ ] Returns `[{ id, name, code }]` for units with `acceptsSelfRegistration = true` and `active = true`.
      No head names, no counts, no item data.
- [ ] Rate-limited. No auth.

### C2. `POST /auth/request-account`
- [ ] Body: `fullName`, `email`, `staffId`, `unitId`, `password`.
- [ ] Validate: email domain in allowed list (D5); password ≥ 8 chars; `unitId` exists, active, accepts
      self-registration; `staffId` and `email` unique.
- [ ] **Ignore** any `role` field in the body. Create user with `role = STAFF`,
      `accountStatus = PENDING_EMAIL_VERIFICATION`.
- [ ] Hash password. Create `EmailToken(VERIFY)`. Send verification email (queued, retried on provider cap).
- [ ] Response identical whether or not the email already exists (no account enumeration).
- [ ] Does **not** create a session.

### C3. `POST /auth/verify-email`
- [ ] Consumes token; sets `PENDING_APPROVAL`; creates `AccountRequest` with `requestedUnitId`.
- [ ] Resolves approver and creates an in-app notification for the head (or SYSTEM_ADMIN if vacant).
- [ ] Token reuse or expiry returns a clean error page, never a stack trace.

### C4. `POST /auth/login` changes
- [ ] Wrong credentials: generic message.
- [ ] Correct credentials but `PENDING_*`, `REJECTED`, `DEACTIVATED`: **no session**; return
      `{ status, reason? }` so the frontend can show "Awaiting approval from your department head" or the
      rejection reason.
- [ ] Rate limit per email and per IP.

---

## 6. PHASE D — Approval queue backend

### D1. `GET /users/approvals` [D1]
- [ ] DEPARTMENT_HEAD: only `AccountRequest` rows where `requestedUnitId` is in the head's unit scope and
      status `PENDING_APPROVAL`.
- [ ] SYSTEM_ADMIN: all escalated requests, requests whose unit has no active head, and requests older than
      `APPROVAL_ESCALATION_DAYS`; supports filter by unit.
- [ ] Others: 404.
- [ ] Return: name, staffId, email, requested unit, submitted date, age in days. Paginated.

### D2. `POST /users/approvals/:id/approve`
- [ ] Run `canDecide`. Out of scope → **404**, no state change, no log of details beyond a security log line.
- [ ] Optional body `confirmedUnitId` is accepted **only from SYSTEM_ADMIN**; a head always confirms the
      requested unit.
- [ ] In one transaction: set `ACTIVE`, set `confirmedUnitId`/`unitId`, record approver, time, note, bump
      nothing else; write `AdminActionLog`.
- [ ] Send decision email (status + sign-in link only, never a password). Notify applicant in-app on first
      login.

### D3. `POST /users/approvals/:id/reject`
- [ ] Same scope check. `reason` required (min length). Status `REJECTED`; applicant can reapply later
      (new `AccountRequest`, old one kept).

### D4. `POST /users/approvals/:id/escalate` ("Not in my department")
- [ ] DEPARTMENT_HEAD in scope only. Sets `escalatedAt`, `escalatedById`, optional reason.
- [ ] Request leaves the head's queue and appears in SYSTEM_ADMIN's. SYSTEM_ADMIN can reassign the unit via D2.

### D5. Escalation job
- [ ] Scheduled job (or lazy on queue read) marks requests older than `APPROVAL_ESCALATION_DAYS` as visible to
      SYSTEM_ADMIN and sends them a notification. The head keeps decision rights; SYSTEM_ADMIN gains them
      for these rows.

### D6. Tests (backend, supertest-style)
- [ ] CS head lists approvals → only CS requests.
- [ ] CS head approves a Biology request → 404, status unchanged.
- [ ] CS head rejects without reason → 400.
- [ ] STAFF calls any approvals endpoint → 404.
- [ ] Biology head cannot see CS request IDs by guessing.
- [ ] Physics (no head) request appears only in SYSTEM_ADMIN queue.
- [ ] Escalated request leaves head queue, appears for SYSTEM_ADMIN.
- [ ] Approval creates exactly one `AdminActionLog` row with correct actor and unit.

---

## 7. PHASE E — Registration & approval frontend (web)

### E1. Request account page (`RequestAccountPage.tsx`)
- [ ] Fields: Full name, AAU email, Staff ID, Department (loaded from `GET /departments`, not hardcoded),
      Password.
- [ ] Remove `DEPARTMENT_OPTIONS` constant; delete dead code and update tests.
- [ ] Visible notice: "This form is for staff members. Department Heads, Property Officers, Auditors and
      administrators are invited separately."
- [ ] Helper under Department: "Your department head will review this request."
- [ ] After submit: "Check your email to verify, then wait for approval" and a spam-folder hint; resend with
      cooldown.

### E2. Verify-email page
- [ ] Success, expired, and already-used states.

### E3. Sign-in page
- [ ] If server returns a non-ACTIVE status, show the message instead of a generic error (pending, rejected
      with reason, deactivated).

### E4. Department Head: "Account Requests" screen
- [ ] New route `/account-requests`, guarded by `ACCOUNT_APPROVE_OWN_UNIT`.
- [ ] Table: name, staff ID, email, department, submitted, age badge. Row actions: **Approve**, **Reject**
      (reason dialog), **Not in my department** (optional reason).
- [ ] Empty state: "No pending requests."
- [ ] Nav item with pending-count badge.

### E5. SYSTEM_ADMIN screen
- [ ] Same screen with extra filters (unit, escalated, stale) and a **unit reassignment** dropdown on approve.
- [ ] Separate "Accounts" area for invites and deactivation (Phase G).

### E6. Navigation (fix the dead links)
- [ ] Rewrite `navConfig.ts` from the table below; every item must resolve to a working route for that role.

| Role | Nav items |
|---|---|
| STAFF | Dashboard, My Items, My Requests, Notifications |
| DEPARTMENT_HEAD | Dashboard, Scan a Tag, My Items, **Department Items**, Department Requests, **Account Requests**, Notifications |
| PROPERTY_OFFICER | Dashboard, Scan a Tag, Browse Items, Requests, Buildings, Audits, Reports, Notifications |
| AUDITOR | Dashboard, Active Audit, Audit History, Notifications |
| SYSTEM_ADMIN | Dashboard, Accounts, Account Requests (escalations), System Config, Notifications |

- [ ] Add a test that, for each role, iterates every nav item and asserts the route renders (no "Page not found").
- [ ] Add a test that each route not in the role's nav is refused by guard.
- [ ] "Scan a Tag" is mobile-only for camera; on desktop show manual tag lookup.

### E7. Front-end tests
- [ ] Registration form submits `unitId`; role not sent.
- [ ] Head queue renders approve/reject/escalate and calls the right endpoints.
- [ ] Non-ACTIVE sign-in states render the right message.

---

## 8. PHASE F — Item visibility scoping (answers "why do I only see CS items?")

### F1. Server-side scope function
- [ ] One function `itemScopeFilter(user)` used by list, search, scan, and report queries:
  - STAFF → items where holder is the user.
  - DEPARTMENT_HEAD → holder is the user, **or** holder is the head's unit (or child units), **or** holder is
    a user in that unit scope.
  - PROPERTY_OFFICER, AUDITOR (in audit scope) → per spec.
  - SYSTEM_ADMIN → none (empty result, same message as STAFF on scan).
- [ ] Remove the global "Browse Items" for DEPARTMENT_HEAD and STAFF. Add **Department Items** for heads.
- [ ] Department filter dropdown on the officer's Browse Items is allowed; for heads it is absent.

### F2. Scan behaviour
- [ ] Out-of-scope tag → "Not assigned to you, contact Property Office" with no custodian or location.
- [ ] Unauthenticated → login page, identical for any tag, including nonexistent ones.

### F3. Tests (the multi-department proof)
- [ ] CS head: Department Items shows only CS-held items; Biology items never appear in list, search, or scan.
- [ ] Staff cs1: sees only own items, not cs2's.
- [ ] Officer: sees all four departments.
- [ ] Item ID of a Biology item requested as CS head by direct URL → 404.

---

## 9. PHASE G — Privileged accounts, deactivation, head replacement

### G1. Invites
- [ ] `POST /users/invite` (SYSTEM_ADMIN): `email`, `role` in {DEPARTMENT_HEAD, PROPERTY_OFFICER, AUDITOR,
      SYSTEM_ADMIN}, `unitId` required for DEPARTMENT_HEAD. Creates user `PENDING_INVITE`-equivalent and an
      `EmailToken(INVITE)`.
- [ ] `POST /auth/accept-invite`: invitee sets own password. No admin sees or sets a password.
- [ ] Enforce: one person cannot be both PROPERTY_OFFICER and AUDITOR. A unit can have only one active head.
- [ ] Frontend: "Invite account" form on SYSTEM_ADMIN Accounts screen with role-dependent unit picker;
      invite list with status (sent / accepted / expired) and resend.

### G2. Deactivation
- [ ] Head deactivates STAFF in own unit; SYSTEM_ADMIN deactivates heads and auditors; another SYSTEM_ADMIN
      deactivates SYSTEM_ADMINs. Nobody deactivates themselves.
- [ ] Immediate effect: bump `tokenVersion`, invalidate sessions.
- [ ] Items held by the deactivated user move to their unit as `REVERTED_UNVERIFIED` (custody event logged).

### G3. Head replacement
- [ ] When a new head is activated for a unit that had one, all department-held items go to
      `REVERTED_UNVERIFIED` for the new head to verify; staff-held items untouched.
- [ ] Previous head's pending approvals are reassigned to the new head.

### G4. Role change
- [ ] Any role change bumps `tokenVersion` and logs before/after.

---

## 10. PHASE H — Notifications

- [ ] Generation-time rule (not display filtering): "needs your review" only to users holding the exact
      capability and scope (the unit's head, or SYSTEM_ADMIN for escalations).
- [ ] "Your request was approved/rejected" only to the applicant/requester.
- [ ] Account notifications never mention item names, tag IDs or asset actions.
- [ ] Polling: lightweight unread-count endpoint every 30 s, refetch on tab focus. No SSE.
- [ ] Backfill job: scan existing notifications for violations of the above; report counts; clean up.

---

## 11. PHASE I — Remaining item lifecycle (after A–H are verified)

Follow v2 spec sections; one task group each, each with endpoint + screen + test:
- [ ] Claim handshake: `PENDING_CLAIM → ACTIVE`, refusal with reason, 14-day reversion (imports exempt),
      photo upload at claim.
- [ ] Transfer chains: within-department (head approves, receiver claims); cross-department (both heads, then
      Property Officer records, then receiver claims); head-held items (Property Officer approves); one open
      request per item; approver resolved server-side via `resolveApprover`.
- [ ] Loans: only `ACTIVE` items, due date required, overdue derived, return records condition.
- [ ] Disposal: holder initiates → head recommends → Property Officer finalises → `DISPOSED`.
- [ ] Void (Property Officer, only before transfer history), Lost workflow with custody timeline.
- [ ] Audit: frozen scope, mobile scanning, immutable results, filters/grouping/sort/date range on audit page.
- [ ] Requests page: time-window selector (this week / month / custom), totals in a report not on the page.
- [ ] Reports by role per v2 §10.1, scoped server-side, exports logged and CSV-injection-safe.

---

## 12. PHASE J — The 11 pending dashboard endpoints (separate batch)

Build each with `requireCapability`, minimal payload, scoped, and a widget that hides when empty:
1. `/buildings` CRUD (Property Officer). 2. `/admin/system` config (SYSTEM_ADMIN).
3. `GET /items/recent?limit=5`. 4. `GET /loans/overdue` (hide at 0). 5. `GET /items/held-by-me?summary=true`.
6. `GET /departments/:id/roster` (head, own unit only). 7. `GET /audits/active`.
8. `GET /audits/findings?status=OPEN`. 9. `GET /audits?limit=3&sort=completedAt:desc`.
10. `GET /system/status`. 11. `GET /system/events?limit=10` (no asset data).

---

## 13. Verification protocol (run live, report real responses)

**Setup:** reset DB, run seed, start backend and web.

| # | Scenario | Expected |
|---|---|---|
| 1 | Register as Biology applicant, verify email | Appears only in `head.bio` queue |
| 2 | `head.cs` calls approve on that request ID | **404**, status unchanged |
| 3 | `head.cs` lists approvals | CS requests only |
| 4 | `head.bio` approves | Account `ACTIVE`, unit = Biology, role = STAFF, log row written |
| 5 | New staff signs in | Sees only My Items; no Browse Items |
| 6 | Applicant tries to POST `role: "SYSTEM_ADMIN"` at registration | Ignored; created as STAFF |
| 7 | Register to Physics (no head) | Appears only for SYSTEM_ADMIN |
| 8 | `head.cs` marks a request "Not in my department" | Leaves head queue; SYSTEM_ADMIN sees it |
| 9 | Pending user signs in | No session; sees pending message |
| 10 | Rejected user signs in | Sees rejection reason |
| 11 | `head.cs` opens Department Items | Only CS items |
| 12 | `head.cs` opens a Biology item URL directly | 404 |
| 13 | Officer opens Browse Items | All four departments, department filter works |
| 14 | SYSTEM_ADMIN opens any item or scan | No asset data |
| 15 | Deactivate staff, reuse old token | 401, items in `REVERTED_UNVERIFIED` |
| 16 | Click every nav item for each of the 5 roles | No "Page not found" |
| 17 | Pending request older than threshold | SYSTEM_ADMIN notified and can decide |

Record the result of all 17 in the PR, with the actual HTTP status and response snippet for each.

---

## 14. Definition of done

- [ ] Phases A–H complete and all 17 verification rows pass **live**.
- [ ] Backend, web and mobile permission matrices match (add a test that compares capability lists).
- [ ] No hardcoded department list remains anywhere in the frontend.
- [ ] Docs updated: v2 spec §3.1, §2.2, §21 contradiction register (record the D1 decision), and the roadmap
      decision log.
- [ ] Any item that could not be verified is listed explicitly as unverified, not omitted.

---

## 15. Open items to resolve with the supervisor

1. Confirm D1 (head approves own-department staff, SYSTEM_ADMIN fallback).
2. `APPROVAL_ESCALATION_DAYS` value.
3. Accepted email domains.
4. Whether a vacant department's staff may self-register at all, or must wait for a head invite.
5. Domain/DNS access for Resend (blocks real email delivery; free tier is 100 emails/day, so stagger rollout).
6. Which fields staff may see on their own items (recommend hiding cost and current value).
