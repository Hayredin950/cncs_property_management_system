# CNCS PMS — Account Approval Authority (Who Approves Which Account)

Audience: the coding agent. This file **amends** `archive/cncs-pms-registration-hierarchy-task-list.md`
(sections 1, 4, 5, 6, 9) and takes precedence over it where they differ.
Sources (all archived as of 14 Oct — the decisions they produced are now stated in
`monolithic-system-design.md`): `archive/cncs_pms_revised_plan_v2.md` §2–§3,
`archive/full-work-plan-and-roadmap.md` (12 Oct decisions),
`archive/property-hierarchy-and-roles-plan.md` §7, §9.1, §17, `archive/supervisor-feedback.md` §1.

**This file is active**: §5 of `monolithic-system-design.md` builds the T1–T9 sequence from it,
and §5.2 says its 20-row live-verification table still applies unchanged. Everything it says
about *who approves what* is settled — see D1 below. Do not re-open the decision.

---

## 0. Ground rules

1. Nothing is done until verified live: real HTTP calls plus a browser click-through as the relevant role.
   Report actual status codes and responses, not "tests pass".
2. The server decides who may approve. Never trust `role`, `unitId`, `approverId` or `authorizedBy` from a client
   without validating it.
3. Out-of-scope access to another unit's request returns **404**, not 403.
4. Every decision is written to the append-only `AdminActionLog`.
5. Backend endpoint, frontend screen and test ship together for each task.

---

## 1. Decision record

| ID | Decision | Status |
|---|---|---|
| D1 | Staff self-registrations are approved by the **head of the applicant's selected unit**. SYSTEM_ADMIN is fallback only. | **DECIDED and final.** `monolithic-system-design.md` §5 makes it the decision: finish the `AccountRequest` flow, retire the legacy `User.accountStatus` flow. The earlier "not yet confirmed" status is closed. |
| D2 | Privileged accounts (Head, Property Officer, Auditor, SYSTEM_ADMIN) are **never self-registered**. SYSTEM_ADMIN issues invites. | Decided (v2 §3.2). |
| D3 | Every privileged invite must record **who authorized it outside the system and a reference** (letter number or equivalent). | Recommended. |
| D4 | A SYSTEM_ADMIN account is created or approved only by a **different** SYSTEM_ADMIN. | Recommended. |

If D1 is rejected: staff requests go only to SYSTEM_ADMIN. Everything else in this file still holds.

Why D3 exists: no role inside the app sits above a Head, Property Officer or Auditor, and SYSTEM_ADMIN
(IT) cannot verify who is appointed to a post. The appointing authority is outside the system (college
office, administration, Office of Auditors). The system must record that authority, not replace it.

---

## 2. Approval authority matrix

| Account type | How created | Who decides | Outside-system authority (recorded) | Fallback |
|---|---|---|---|---|
| STAFF / instructor | Self-registers: name, AAU email, staff ID, unit, password. Role forced to STAFF. | Active head of the selected unit | Head knows the person | Parent unit head, then SYSTEM_ADMIN (vacant head, stale request, wrong unit) |
| DEPARTMENT_HEAD | Invite by SYSTEM_ADMIN, bound to one unit | SYSTEM_ADMIN executes | College office / administration appointment | A second SYSTEM_ADMIN if the actor is the invitee |
| PROPERTY_OFFICER | Invite by SYSTEM_ADMIN | SYSTEM_ADMIN executes | Property office / administration appointment | Same |
| AUDITOR | Invite by SYSTEM_ADMIN | SYSTEM_ADMIN executes | Office of Auditors authorization | Same |
| SYSTEM_ADMIN | Seeded (first) or invited by another SYSTEM_ADMIN | A different SYSTEM_ADMIN | IT/administration authorization | None; at least two SYSTEM_ADMINs must exist before launch |

Invariants (enforce in service layer, and in the database where possible):
- The requester or invitee is never the decider of their own account.
- A head decides only for staff whose unit is the head's unit or a child of it.
- One person cannot hold both PROPERTY_OFFICER and AUDITOR.
- A unit has at most one active head; one user heads at most one unit.
- Self-deactivation is blocked for every role.
- When a role changes, bump `tokenVersion` so old sessions die.

Future tier: if a Dean/College tier is added, the Dean becomes the approving authority for heads. This must be
a change in `resolveApprover` and the permission table only, with no schema rewrite.

---

## 3. Tasks

### T1. Schema
- [ ] Add to the invite/account-request model: `authorizedBy` (string, required for privileged invites),
      `authorizationRef` (string, required for privileged invites), `authorizationNote` (optional),
      `invitedById`, `invitedAt`.
- [ ] Add `AdminActionLog` fields if missing: `actorId`, `action`, `targetUserId`, `unitId`, `before`, `after`,
      `authorizedBy`, `authorizationRef`, `createdAt`. Append-only: revoke UPDATE/DELETE at DB level if
      supported.
- [ ] Migration applies on a fresh DB and on a copy of the dev DB.

### T2. Capabilities (backend, web, mobile kept in sync)
- [ ] `ACCOUNT_APPROVE_OWN_UNIT` → DEPARTMENT_HEAD
- [ ] `ACCOUNT_APPROVE_ANY` → SYSTEM_ADMIN
- [ ] `ACCOUNT_INVITE` → SYSTEM_ADMIN
- [ ] `ACCOUNT_DEACTIVATE_OWN_UNIT` → DEPARTMENT_HEAD (STAFF only)
- [ ] `ACCOUNT_DEACTIVATE_PRIVILEGED` → SYSTEM_ADMIN (heads and auditors)
- [ ] Mirror in `backend/src/services/permissions.ts`, `frontend/src/lib/permissions.ts`,
      `mobile/lib/models/permissions.dart`. Add a test comparing the three capability lists.

### T3. `resolveApprover` and `canDecide` (`backend/src/services/approvers.ts`)
- [ ] `resolveApprover(unitId)` → active head; else parent's active head; else SYSTEM_ADMIN. A head whose
      account is not `ACTIVE` counts as vacant.
- [ ] `canDecide(actor, request)`: SYSTEM_ADMIN allowed (not on their own account); DEPARTMENT_HEAD allowed only
      if `actor.status === ACTIVE`, the request is staff self-registration, and the request's unit is in the
      actor's unit scope; everyone else denied. Self-decision always denied.
- [ ] Use `canDecide` in **every** approve, reject and escalate handler, not only in the list query.

### T4. Staff registration backend
- [ ] `GET /departments` (public): `id, name, code` for active units accepting self-registration. No heads,
      no counts.
- [ ] `POST /auth/request-account`: body `fullName, email, staffId, unitId, password`. Ignore any `role` field.
      Validate AAU email domain (configurable list), password length, unique email and staffId, valid unit.
      Create user as STAFF, status `PENDING_EMAIL_VERIFICATION`. Identical response whether or not the email
      exists. No session.
- [ ] `POST /auth/verify-email`: single-use hashed token; moves to `PENDING_APPROVAL`; creates the request;
      notifies the resolved approver (head, else SYSTEM_ADMIN).
- [ ] `POST /auth/login`: for non-ACTIVE statuses return `{status, reason?}` and no session.

### T5. Staff approval queue backend
- [ ] `GET /users/approvals`: head sees only own-unit `PENDING_APPROVAL` staff requests; SYSTEM_ADMIN sees
      escalated, headless-unit and stale (older than `APPROVAL_ESCALATION_DAYS`, default 5) requests; others get 404.
- [ ] `POST /users/approvals/:id/approve`: run `canDecide`; out of scope is 404 with no state change.
      `confirmedUnitId` is honored only from SYSTEM_ADMIN. One transaction: set ACTIVE, record approver,
      time, note; write `AdminActionLog`; send decision email (status and sign-in link only, never a password).
- [ ] `POST /users/approvals/:id/reject`: same scope check; `reason` required.
- [ ] `POST /users/approvals/:id/escalate` ("Not in my department"): head in scope only; moves request to the
      SYSTEM_ADMIN queue; SYSTEM_ADMIN may reassign the unit when approving.
- [ ] Escalation job (or lazy on read): requests older than the threshold become visible to SYSTEM_ADMIN with a
      notification; the head keeps decision rights.

### T6. Privileged invites backend — **built 14 Oct** (unit-tested; live verification blocked, see T1)
- [x] `POST /users/invite` (SYSTEM_ADMIN only, `ACCOUNT_INVITE`). Body: `email, role,
      unitId (required for DEPARTMENT_HEAD), authorizedBy, authorizationRef, authorizationNote?`.
      Rules in `backend/src/services/invites.ts` (`assertInvitable`), route in `routes/users.ts`.
- [x] Rejects with 400 if `authorizedBy` or `authorizationRef` is missing — required for every
      privileged role, enforced at the route *and* in the service.
- [x] Rejects: role not in {DEPARTMENT_HEAD, PROPERTY_OFFICER, AUDITOR, SYSTEM_ADMIN} (400); a unit
      that already has a **working** head (400 — an inactive head does not count); the same person as
      PROPERTY_OFFICER and AUDITOR (409, against an outstanding invite as well as a live account); a
      SYSTEM_ADMIN inviting their own address (400).
- [x] `POST /auth/accept-invite`: single-use, expiring (72 h), hashed-at-rest token in `EmailToken`;
      the invitee sets their own password and their own name. **No administrator ever sees or sets a
      password** — the invite payload has no password field, and `POST /auth/register` (the old
      admin-sets-password path) has been deleted from the API, not merely deprecated.
      The invite link is returned to the issuing administrator as well as emailed, because no SMTP
      transport is configured yet (`NOTIFY_EMAIL` off) and an undeliverable invitation is not sent.
- [~] Activating a new head: sets `OrgUnit.headId` and moves the unit's department-held items to
      `REVERTED_UNVERIFIED` (terminal rows skipped) in the acceptance transaction. **"Reassign the
      previous head's pending approvals" is not implemented and should not be:** the queue is derived
      from status and unit on read (`GET /users/approvals`), not assigned to a person, so there is no
      per-approver list to move — what changes is `resolveApprover`, which now resolves to the new head.
- [~] Logged: every invite, renewal and acceptance writes `AdminActionLog` with the outside
      authorization on the row. **Not logged yet:** expiry (a token that ran out is never written) and
      revoke/resend (neither exists — see below).
- [ ] Not built: resend, revoke, and the invite status list (sent/accepted/expired).
- [ ] `GET /departments/invitable` was added for the head picker — all active departments with
      `hasActiveHead`, deliberately *not* the self-registration list, which hides the headless units
      an invite exists for.

### T7. Deactivation backend
- [ ] Head deactivates STAFF in own unit; SYSTEM_ADMIN deactivates heads and auditors; another SYSTEM_ADMIN
      deactivates a SYSTEM_ADMIN. Self-deactivation blocked.
- [ ] Immediate: bump `tokenVersion`; items held by that user move to their unit as `REVERTED_UNVERIFIED`;
      log with reason.

### T8. Frontend (web)
- [ ] Request account page: fields name, AAU email, staff ID, Department (from `GET /departments`, delete the
      hardcoded `DEPARTMENT_OPTIONS`), password. Visible notice that this form is for staff and that Heads,
      Property Officers, Auditors and admins are invited. Helper text: "Your department head will review this."
- [ ] Verify-email page with success, expired and already-used states. Sign-in page shows pending, rejected
      (with reason) and deactivated messages.
- [ ] Department Head: "Account Requests" screen (route guarded by `ACCOUNT_APPROVE_OWN_UNIT`) with Approve,
      Reject (reason dialog) and "Not in my department"; pending-count badge in nav; empty state.
- [ ] SYSTEM_ADMIN: Account Requests (escalated, stale, headless filters; unit reassignment on approve) and an
      Accounts area with **Invite account** form: role selector, unit picker for heads, required
      **Authorized by** and **Authorization reference** fields, invite status list (sent, accepted, expired)
      with resend and revoke.

> **The nav list below is *not* the final word.** `monolithic-system-design.md` §13 restates it
> for all five roles and is the later statement; where the two differ, §13 wins. This table is
> kept only as the text T8 was written against.

- [ ] Nav per role (every item must open a working page):

| Role | Nav |
|---|---|
| STAFF | Dashboard, My Items, My Requests, Notifications |
| DEPARTMENT_HEAD | Dashboard, My Items, Department Items, Department Requests, Account Requests, Notifications |
| PROPERTY_OFFICER | Dashboard, Scan a Tag, Browse Items, Requests, Buildings, Audits, Reports, Notifications |
| AUDITOR | Dashboard, Active Audit, Audit History, Notifications |
| SYSTEM_ADMIN | Dashboard, Accounts, Account Requests, System Config, Notifications |

- [ ] Test: for each role, click through every nav item and assert no "Page not found"; routes outside the role's
      nav are refused by the guard.

### T9. Seed data for verification
- [ ] College CNCS; departments Computer Science, Biology, Chemistry, Physics. Physics has **no head**.
- [ ] Heads for CS, Biology, Chemistry; two staff each; a few items per department; two SYSTEM_ADMINs; one
      Property Officer; one Auditor; a few pending requests per department. No real personal data.

---

## 4. Live verification (report the actual response for every row)

| # | Scenario | Expected |
|---|---|---|
| 1 | Biology applicant registers and verifies email | Appears only in the Biology head's queue |
| 2 | CS head approves that Biology request ID | **404**, status unchanged |
| 3 | CS head lists approvals | CS requests only |
| 4 | Biology head approves | ACTIVE, unit Biology, role STAFF, log row with approver and time |
| 5 | Registration body contains `role: "SYSTEM_ADMIN"` | Ignored; created as STAFF |
| 6 | Registration to Physics (no head) | Visible only to SYSTEM_ADMIN |
| 7 | CS head clicks "Not in my department" | Leaves head queue; SYSTEM_ADMIN sees it and can reassign |
| 8 | Pending user signs in | No session; pending message shown |
| 9 | Rejected user signs in | Rejection reason shown |
| 10 | STAFF calls any approvals endpoint | 404 |
| 11 | SYSTEM_ADMIN invites a head without `authorizationRef` | 400, nothing created |
| 12 | SYSTEM_ADMIN invites a head with valid authorization | Invite created, log row includes `authorizedBy` and ref |
| 13 | Invite a second head for a unit that has one | 400 |
| 14 | Invite the same person as Property Officer and Auditor | Rejected |
| 15 | SYSTEM_ADMIN tries to approve or invite their own account | Rejected |
| 16 | Head deactivates a staff member; old token reused | 401; items become `REVERTED_UNVERIFIED` |
| 17 | Head tries to deactivate another head or an auditor | 404 or 403 per policy, no change |
| 18 | Request pending longer than threshold | SYSTEM_ADMIN notified and can decide |
| 19 | Invitee opens expired or already-used link | Clean error, no account change |
| 20 | Click every nav item for all five roles | No "Page not found" |

---

## 5. Definition of done

- [ ] T1–T9 complete and all 20 rows pass live, with real responses pasted in the PR.
- [ ] Backend, web and mobile capability lists match (automated test).
- [ ] No hardcoded department list remains in any client.
- [ ] Docs updated: D1–D4 recorded in `project-task-checklist.md`, and each row ticked in
      `monolithic-system-design.md` §5/§15 as it passes live.
- [ ] Anything not verified is listed explicitly as unverified.

## 6. Open items for the supervisor

1. Confirm D1 (heads approve own-unit staff; SYSTEM_ADMIN fallback).
2. Which exact office authorizes heads, Property Officer and Auditors in practice, so the invite form can offer
   a sensible "Authorized by" list.
3. `APPROVAL_ESCALATION_DAYS` value.
4. Whether staff may self-register into a unit that has no head, or must wait for a head invite.
5. Accepted email domains; Resend domain and DNS access (free tier is 100 emails/day, so stagger rollout).
