# CNCS Property Management System — Monolithic Design, Flow & Structure

**Status: this document supersedes every other spec file where they conflict.** It is built
from the 14 Oct audit (verified file:line, live behavior, not claims) plus every prior
decision made in this project. Where a prior doc said one thing and the audit proved the
code does another, this document states the target truth and what has to change to reach it.

**Rule for whoever implements this:** every item below is either `[DONE]` (verified true
right now, cite file:line), `[BROKEN]` (code exists but doesn't work — fix, don't rebuild),
or `[BUILD]` (doesn't exist yet). Don't re-verify a `[DONE]` item from scratch; don't trust
a `[BROKEN]` item's existing tests, since they were passing while the live behavior was wrong.

---

## 0. Non-negotiable ground rules (apply to every section below)

1. Nothing is "done" until verified live — real HTTP call or browser click-through, actual
   response pasted, not "tests pass."
2. The server decides every permission. Never trust `role`, `unitId`, or `approverId` from
   a client payload without validating against the database.
3. Out-of-scope access returns 404, not 403 — don't reveal that a resource exists.
4. Every state-changing action writes to an append-only log (`AdminActionLog` for
   accounts, `CustodyEvent` for items, `AuditItemResultRow` for audits).
5. Backend endpoint, frontend caller, and test ship together — never commit a route with
   no UI wired to it, and never wire a UI widget to an endpoint that doesn't exist yet.
6. One branch is canonical. Resolve this before writing any new code (see §11.0).

---

## 1. Roles (final — 5 roles, mobile must sync)

```
SYSTEM_ADMIN       — technical/account administration only. Zero asset data, zero approvals
                     on transfers/disposals/loans.
PROPERTY_OFFICER   — college-wide operational authority. Registers items, approves
                     transfers/disposals/loans, runs audits, manages buildings.
DEPARTMENT_HEAD    — department-scoped. Approves own-unit staff account requests and
                     own-department transfer/disposal/loan requests. Can also personally
                     hold items like staff.
STAFF              — self-scoped custodian. Requests only; never registers, edits, or
                     approves anything.
AUDITOR            — read-only audit role. Runs audit sessions, reviews findings. No
                     approvals, no item edits.
```

`[DONE]` Backend: `schema.prisma:39-45`. Web: `frontend/src/lib/permissions.ts:32-36`.
`[BROKEN]` Mobile: `mobile/lib/models/enums.dart:21` still parses a 6th role `ACCOUNT_ADMIN`,
and `mobile/lib/models/permissions.dart` has no `ACCOUNT_*` capabilities. **Fix: delete
`ACCOUNT_ADMIN` from mobile's role enum, add the 5 `ACCOUNT_*` capabilities from §3, add a
test that asserts backend/web/mobile capability lists are identical (this test does not
exist yet — build it).**

---

## 2. Organizational hierarchy

```
College (CNCS, single college in scope)
  └── Department (Computer Science, Biology, Chemistry, Physics)
        └── Individual (STAFF, or DEPARTMENT_HEAD holding personally)
```

Physics has no head by design (seed data requirement, tests the vacant-head fallback path).
`OrgUnit` table is self-referencing with a `tier` field; `[DONE]` per audit, `schema.prisma`
holder/org fields confirmed present.

---

## 3. Capabilities (exact strings — implement as a lookup table, not scattered `if`s)

```
ITEM_CREATE                    → PROPERTY_OFFICER
ITEM_EDIT                      → PROPERTY_OFFICER
ITEM_VOID                      → PROPERTY_OFFICER
TRANSFER_APPROVE_STAGE1        → PROPERTY_OFFICER, DEPARTMENT_HEAD (own unit, sending side)
TRANSFER_APPROVE_STAGE2        → PROPERTY_OFFICER, DEPARTMENT_HEAD (own unit, receiving side)
DISPOSAL_APPROVE               → PROPERTY_OFFICER
LOAN_APPROVE                   → PROPERTY_OFFICER, DEPARTMENT_HEAD (own unit)
AUDIT_RUN                      → PROPERTY_OFFICER, AUDITOR
AUDIT_VIEW                     → PROPERTY_OFFICER, AUDITOR
ACCOUNT_APPROVE_OWN_UNIT       → DEPARTMENT_HEAD
ACCOUNT_APPROVE_ANY            → SYSTEM_ADMIN
ACCOUNT_INVITE                 → SYSTEM_ADMIN
ACCOUNT_DEACTIVATE_OWN_UNIT    → DEPARTMENT_HEAD (STAFF only)
ACCOUNT_DEACTIVATE_PRIVILEGED  → SYSTEM_ADMIN
REQUEST_CREATE_SELF            → STAFF, DEPARTMENT_HEAD, PROPERTY_OFFICER
REQUEST_CREATE_DEPARTMENT      → DEPARTMENT_HEAD
BUILDING_MANAGE                → PROPERTY_OFFICER
REPORT_RUN_DEPARTMENT          → DEPARTMENT_HEAD
REPORT_RUN_COLLEGE             → PROPERTY_OFFICER, AUDITOR
```

`[BROKEN]`/`[BUILD]`: mirror this exact list in `backend/src/services/permissions.ts`,
`frontend/src/lib/permissions.ts`, `mobile/lib/models/permissions.dart` — audit found these
three are currently out of sync (mobile missing all `ACCOUNT_*` entries). Add the
three-way comparison test.

---

## 4. Item data model and lifecycle

### 4.1 Required fields (confirmed present, `[DONE]`)
```
Item {
  pin               unique, lifetime, DB-uniqueness constraint
  name, condition, status (see 4.2)
  holderType / holderId     — STAFF | DEPARTMENT, who has custody now
  orgUnitId, campusId, buildingId, roomId
  version                   — optimistic locking, [DONE] items.ts:109,617,725
  voidReason / voidedAt / voidedById   — [DONE schema, BROKEN: no route uses it yet]
}
```
`[BROKEN]`: `ownerId` is still a live column returned by the API alongside the holder
fields — this is the legacy fallback the holder model was supposed to replace. **Fix:
stop returning `ownerId` in API responses; holder fields are the only source of truth.**

`[BUILD]`: `DEPARTMENT` holder has no `departmentHeadSnapshot` to name who held
approval authority at the time of a custody event — add this field, populate it on every
write to `CustodyEvent`.

### 4.2 Status state machine (exact transitions, no others permitted)
```
REGISTERED → ASSIGNED → IN_USE / IN_STORE → LOANED / UNDER_REPAIR → DISPOSED / LOST
                                           ↘ PENDING_CLAIM ↗ (claim handshake, see §6)
```
An item `LOANED` cannot be transferred or disposed until `Loan.returnedAt` is set.
`DISPOSED` is terminal — reversal requires an explicit, logged correction record, never a
direct status edit. `[BROKEN]`: no route currently sets `VOIDED` — build the void endpoint
(`ITEM_VOID` capability) that property officers use instead of hard delete.

### 4.3 Hard delete — must be fully removed
`[BROKEN]`: `DELETE /users/:id` still hard-deletes an account with no audit trail when it
has none. **Fix: every delete-shaped action becomes a status change (`VOIDED` for items,
`DEACTIVATED` for accounts), logged, never a DB row removal.**

---

## 5. Account approval — THE decision this document makes final

The audit confirmed **two account-approval systems currently coexist**: a working legacy
`User.accountStatus` flow, and a dead, unwired `AccountRequest` flow (per
`cncs-pms-account-approval-authority.md`, D1 already confirmed by you).

**Decision: finish building the `AccountRequest` flow. Retire the legacy flow once it's
live. Do not leave both running.** Reasoning: D1 (heads approve their own unit's staff,
SYSTEM_ADMIN as fallback) is already confirmed, is the better design, and the legacy flow
cannot express department-scoped approval at all — keeping it means building compensating
logic on top of an architecture that doesn't fit the decision already made.

### 5.1 Build order for this section (T1-T9 from the authority doc, now sequenced)

1. **T1 Schema** — commit the already-drafted `authorizedBy`/`authorizationRef` fields on
   the invite model and `AdminActionLog`; generate and apply the migration against a copy
   of the dev DB first, then the real one. `[BROKEN]`: these fields exist uncommitted in
   the working tree right now — commit them as their own slice, don't let them sit dirty.
2. **T2 Capabilities** — already specified in §3 above; implement and add the 3-way sync test.
3. **T3 `resolveApprover` / `canDecide`** — `[BROKEN]`: `resolveApprover` is imported but
   unused (`users.ts:20`). Wire it into every approve/reject/escalate handler, not just the
   list query — this was flagged as a requirement and is not yet met.
4. **T4 Staff registration** — `[BROKEN]`: `/auth/account-requests` exists but there's no
   `/auth/verify-email`, and `staffId` doesn't exist anywhere in the schema. Build both.
5. **T5 Approval queue** — scope by unit for heads, escalation for vacant/stale (default
   5 days — confirm with supervisor per open item #3 below, use 5 as the working default).
   `[BROKEN]`: escalation is currently a string literal `"[ESCALATED]"` stuffed into a
   `reviewNote` field — replace with a real status/queue mechanism.
6. **T6 Privileged invites** — `[BUILD]`: `/users/invite` and `/auth/accept-invite` don't
   exist yet. Build per the authority doc's exact validation rules (reject missing
   `authorizedBy`/`authorizationRef`, reject double-head, reject
   Property-Officer-and-Auditor-same-person, reject self-invite).
7. **T7 Deactivation** — `[BUILD]`, not started. Immediate `tokenVersion` bump, items move
   to `REVERTED_UNVERIFIED`, logged with reason.
8. **T8 Frontend** — fix the 3 dead nav links found in the audit (`/buildings`,
   `/admin/account-requests`, `/admin/system` all point at routes `router.tsx` never
   declares) before adding any new screens — a nav item with no route is worse than no nav
   item.
9. **T9 Seed data** — `[DONE]` per audit (CS/Bio/Chem heads + staff, Physics headless,
   2 SYSTEM_ADMINs, 1 officer, 1 auditor, pending requests per department).

### 5.2 Live verification — the 20 rows from the authority doc still apply unchanged, run
all 20 once T1-T8 are built, paste real responses, mark none as done until actually run.

---

## 6. Claim handshake

`[BROKEN — code present, unverified live, returns 404 in production right now]`.
`POST /items/:id/claim` and `POST /items/:id/refuse-claim` exist (`items.ts:762,881`) with
correct 409 conflict handling, but nothing exercises them in tests and production doesn't
serve this code at all (old revision deployed). **Fix order: deploy the correct revision
first (§11), then add a test, then verify live.**

---

## 7. Transfer / Disposal / Loan workflows

Code structure is `[DONE]` (dual-stage transfer, single-approval disposal, loan with
return endpoint — `requestWorkflow.ts`), but `[BROKEN]` live: the department head's
approval queue returned empty (`{"requests":[],"total":0}`) when it should show pending
items, and `isDisposal`/`isLoan`/`isStage2` are assigned-but-unused lint warnings
indicating genuinely incomplete branches in `requestWorkflow.ts:321-324`.

**Fix: trace why the head's queue is empty — likely the same approver-resolution gap as
§5.1 item 3 (`resolveApprover` unused). Finish the disposal/loan branches flagged by the
unused-variable lint warnings — these are not cosmetic, they mean a code path was written
and never finished.**

Rules (unchanged from prior specs, now final):
- `ownerId`/holder split: `fromOwnerId` (current) and `toOwnerId`/`toOrgUnitId` (future) —
  never one ambiguous field.
- Maker-checker: initiator can never also approve.
- Disposal: single approver (Property Officer) for phase 1 — two-approver threshold is
  deferred, not built, per the earlier scope decision.
- Multiple pending requests on one item: first valid request granted, competitors
  `WAITLISTED` with a reason — this was a stated default, still the working rule.

---

## 8. Audit workflow

Backend `[DONE]` (`audits.ts` routes, 12 passing tests). Web `[BROKEN]` — this is the
single biggest concrete break found: commit `bd1cc65` (authored by a different AI agent,
Devin, not this session) deleted working hooks (`useCreateAuditSession`,
`useCompleteAuditSession`, `useScanAuditItem`, `useAuditsList`, `useAuditSession`) and
replaced them with bare `fetch` calls, while `AuditHistoryQuickList.tsx` still imports a
hook that no longer exists. This is the direct cause of most of the 15 `tsc` errors.

**Fix: do not patch around this. Either (a) properly finish the uncommitted partial
restoration already sitting in the working tree so it matches the committed call sites, or
(b) revert `bd1cc65` fully and reapply only its legitimate endpoint additions as a clean,
separate commit. Pick (b) unless (a) is provably faster — a commit that broke the build
should not be the foundation future work builds on.**

Flow (unchanged, confirmed correct design):
```
Start audit (scope) → scan/search each item → mark FOUND / MISSING / OUTSIDE_SCOPE
  → close session (permanent, uneditable, timestamped)
  → MISSING triggers review: confirmed LOST (loss record) or re-checked
```

---

## 9. Requests (time-windowing)

`[DONE]` in code (`requests.ts:124`, filters `this-week|this-month|last-30-days|custom`).
`[BROKEN]`: `GET /requests/pending` returns 500 in production — fix as part of the
production-deployment-mismatch work in §11, confirm it's not a code bug first by testing
against the correct deployed revision.

---

## 10. Security — hard requirements, now including the 5 confirmed live bugs

Every item below is mandatory, server-side, verified live before being marked done:

1. **`GET /items` must require authentication.** `[BROKEN — live, confirmed]`: currently
   returns the full register (minus cost/ownerId) to anyone, no token needed, due to
   `optionalAuthenticate` silently downgrading invalid/missing tokens to anonymous instead
   of failing. Fix: `authenticate` (hard-require), not `optionalAuthenticate`.
2. **Item-by-id must enforce the same scope as the list view.** `[BROKEN — live,
   confirmed]`: STAFF/DEPARTMENT_HEAD can read any item by ID directly even though their
   list correctly returns 0/own-only rows. This is the textbook IDOR pattern — add the
   scope check to the single-item route, not just the list route.
3. **SYSTEM_ADMIN must never receive asset data from any endpoint, including `/requests`.**
   `[BROKEN — live, confirmed]`: `/requests` returns item names/tag IDs to SYSTEM_ADMIN,
   including a transfer the admin's own account requested. Fix at generation/query time —
   SYSTEM_ADMIN's request list should be empty or account-related only, never asset-joined.
4. **`/system/events` must exclude asset/audit activity.** `[BROKEN — live, confirmed]`:
   currently returns `type:"AUDIT"` rows. Fix: filter to account/system-level events only.
5. **`/reports/inventory` and `/requests/pending` currently 500 in production** — fix as
   part of correcting the deployment (§11), then re-verify; don't assume these are code
   bugs until confirmed against the *correct* deployed revision.
6. Optimistic locking `[DONE]`, DB-level uniqueness on PIN `[DONE]`, session invalidation
   on role change (`tokenVersion` bump) — `[BUILD]`, not yet confirmed implemented anywhere
   in the audit, build and verify.
7. Public/unauthenticated responses never include `cost`, `custodian`/holder identity, or
   exact room-level location — category and building only.

---

## 11. Deployment and branch consolidation — do this BEFORE any of the above

The audit proved **production is not running any of this session's verified work** —
behaviorally confirmed via 404s on routes that exist in code and route-ordering evidence
showing the old `personal/main` revision is what's actually live.

### 11.0 Branch consolidation (first action, before any code change)
- Canonical branch: `phase-a-b-complete` (most current, 38 commits ahead of
  `origin/main`).
- Resolve the duplicate lint-fix-under-two-hashes issue between `main` and
  `phase-a-b-complete`.
- Discard or explicitly archive the stale branches (`frontend/phase1-scaffold`,
  `phase2/workflows-and-notifications`, `infra/docker-prisma-generate`,
  `docs/phase1-docker-criterion-met`, `chore/phase1-docs-and-project-hygiene`) — confirm
  none contain unmerged work worth keeping first.
- Commit the 8 currently-dirty modified files and the untracked `vercel.json` as their own
  reviewed slice — don't let uncommitted schema/hook changes keep sitting in the working
  tree indefinitely.

### 11.1 Fix the web build
15 `tsc` errors, all traced to `bd1cc65`'s deletions (§8). Fix this before deploying
anything — a red build cannot be meaningfully deployed and verified.

### 11.2 Redeploy and prove it's the right revision
Don't trust Vercel's "Ready" status alone — it was "Ready" while serving the wrong
revision. After deploying, run the same behavioral proof the audit used: hit a route that
only exists on the new revision (e.g. `/items/:id/claim`) and confirm it responds instead
of 404.

---

## 12. Backend ↔ Frontend wiring map — every endpoint, every caller, verified

This table is the actual deliverable you asked me not to skip: **nothing in this system is
"done" until both sides exist AND are confirmed calling each other correctly.**

| Endpoint | Backend status | Frontend caller | Wired? |
|---|---|---|---|
| `GET /items` (list) | `[BROKEN]` — public, needs auth fix §10.1 | `ItemsListPage.tsx` | Yes, but endpoint itself is wrong |
| `GET /items/:id` | `[BROKEN]` — IDOR §10.2 | item detail page | Yes, but endpoint itself is wrong |
| `GET /items/recent` | `[BROKEN]` — shadowed by route ordering (`items.ts:982` after `:tagId`) | dashboard widget | No — route unreachable, move it above the `:id`/`:tagId` route |
| `GET /items/held-by-me` | `[BROKEN]` — same shadowing issue | dashboard widget | No — same fix |
| `POST /items/:id/claim` | `[BROKEN]` — untested, not live-verified | — | Needs frontend screen built (§6) |
| `POST /items/:id/void` | `[BUILD]` | — | Needs both sides built |
| `GET /buildings` | `[DONE]` (officer-only, confirmed 403 for non-officer) | nav item exists | **No route declared in `router.tsx`** — fix routing |
| `GET /admin/system/status` | `[BROKEN]` — backend serves `/system/status`, not `/admin/system/status` | widget calls `/admin/system/status` | No — path mismatch, pick one path and fix both sides |
| `GET /system/events` | `[BROKEN]` — leaks audit data §10.4 | SYSTEM_ADMIN dashboard widget | Yes, but endpoint is wrong |
| `GET /loans/overdue` | `[DONE]` code exists | dashboard widget | Confirm live after redeploy (§11.2) |
| `GET /departments/:id/roster` | `[DONE]` code exists | dashboard widget | Confirm live after redeploy |
| `GET /audits/active` | `[DONE]` code exists | `AuditHistoryQuickList.tsx` — **imports a hook that doesn't exist** | No — fix per §8 |
| `GET /audits/findings` | `[DONE]` code exists | dashboard widget | Confirm live after redeploy |
| `GET /requests?window=` | `[DONE]` code exists | requests page | Confirm live after redeploy |
| `GET /requests/pending` | `[BROKEN]` — 500 in production | pending-count badge | No — fix §9 |
| `/admin/account-requests` nav route | — | nav item exists | **No route declared** — fix routing |
| `/admin/system` nav route | — | nav item exists | **No route declared** — fix routing |
| `/account-requests` (Dept Head) nav route | — | nav item exists | **No route declared** — fix routing |

**Rule going forward: before marking any endpoint `[DONE]` in the task checklist, confirm
its row in this table says "Yes" under Wired — not just that both sides exist in isolation.**

---

## 13. Per-role UI — final, with the "only what's wired and relevant" rule enforced

This restates `archive/role-based-ui-spec.md`'s nav/widget lists (already well-designed) with one
addition: **no nav item may exist without a declared route, and no widget may be wired to
an endpoint marked `[BROKEN]` or `[BUILD]` above until that endpoint is fixed.** Until a
widget's endpoint is fixed, show a clear "temporarily unavailable" empty state — never a
silent zero that looks like real data (this was the original dashboard-leak failure mode).

| Role | Nav (only declared, working routes) | Dashboard widgets (only wired ones) |
|---|---|---|
| STAFF | Dashboard, My Items, My Requests, Notifications | none specialized (per spec) |
| DEPARTMENT_HEAD | Dashboard, My Items, Department Requests, Account Requests*, Notifications | Held-items summary*, Roster snapshot* |
| PROPERTY_OFFICER | Dashboard, Scan a Tag, Browse Items, Requests, Buildings*, Active Audit, Audit History, Reports, Notifications | Recently registered*, Overdue loans |
| AUDITOR | Dashboard, Active Audit, Audit History, Notifications | Audit progress*, Open findings, History list* |
| SYSTEM_ADMIN | Dashboard, Account Admins, Account Requests*, System Config*, Notifications | System status, Recent events (fixed per §10.4) |

`*` = currently has a dead route or broken endpoint per §12 — fix before re-enabling in
the live nav; don't remove the item from the spec, fix what's under it.

Collapsed sidebar: `[DONE]` structurally per `AppLayout.tsx` per the last report, but
**not independently re-verified in this audit** — confirm live as part of §11.2's
redeploy verification.

---

## 14. Reports

Deferred past this phase, per the earlier scope decision (finance/statutory reporting
needs domain expertise the team doesn't currently have). Phase-1 reports (department,
college, university, auditor views, pulling live from the same tables as audit/transfer —
never a separate drifting dataset) remain `[BUILD]`, not started. Do not start this until
§11 (deployment) and the security fixes in §10 are complete — reports built on top of a
leaking/misrouted system just reproduce the same bugs in report form.

---

## 15. Definition of done for THIS document's work

- [ ] Branches consolidated to one (§11.0)
- [ ] Web build green, CI green (§11.1)
- [ ] Correct revision confirmed deployed, behaviorally proven (§11.2)
- [ ] All 5 confirmed security bugs fixed and re-verified live (§10.1-10.5)
- [ ] Account-approval duplication resolved per §5's decision, T1-T9 complete, 20 rows
      verified live with real responses
- [ ] Mobile synced to 5 roles with capability parity test passing
- [ ] Every row in §12's wiring table says "Yes" under Wired
- [ ] Every nav item in §13 opens a real, working, correctly-scoped page
- [ ] `docs/project-task-checklist.md` updated to reflect true state after all of the above

---

## 16. Open items still needing a human decision (not blocking, but don't guess on these)

1. `APPROVAL_ESCALATION_DAYS` — using 5 as the working default; confirm with supervisor.
2. Whether staff may self-register into a headless unit (Physics) or must wait for a head
   invite — currently assumed "yes, routes to SYSTEM_ADMIN" per the authority doc; confirm.
3. Accepted email domains and the email provider's DNS/subdomain setup — still open from
   earlier in this project, unrelated to the audit, still unresolved.
4. Which exact office authorizes heads/officers/auditors in practice, for the invite form's
   "Authorized by" field — supervisor input needed, not guessable.
