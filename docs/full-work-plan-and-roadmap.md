# CNCS Property Management System — Full Work Plan & Roadmap

**Repo:** https://github.com/Hayredin950/cncs_property_management_system
**Owner:** Hayredin950 (hayredin.950@gmail.com)

This plan is final enough to build from. Every open question either has a team decision
behind it (from Yanet's reply), or — where there was no time to get one — a concrete
default chosen from our research, marked clearly as a default so it can be swapped later
without reworking the foundation. Nothing here waits on further discussion.

**Decisions of 12 Oct** (these close the three conflicts raised in
`spec-review-and-open-questions.md`):

1. **Role tiers — simplified.** College → department only. The campus and university tiers
   are cut for phase 1; the spec's "one campus only" (13.3) is the deployment reality, and
   `property-hierarchy-and-roles-plan.md` stays as the reference for a future university-wide
   rollout.2. **Account flow — admin-approval queue kept.** Staff request → `SYSTEM_ADMIN` (which owns
   the account-admin responsibilities) approves → account created. This is explicit supervisor feedback on
   record, so it is not simplified back into un-approved self-registration.
3. **Reports — frozen when official, live when internal.** Anything that leaves the system
   as a record (exported, submitted, shown as "the audit result") is snapshotted at
   generation; dashboards stay live.

---

## 0. Scope boundary — what's in, what's out (locked)

**In scope, must ship:**
- Full role/permission rework
- College → department as the **only live organisational tiers** — no campus tier, no
  university tier in phase 1 (12 Oct decision)
- Item registration, lifecycle, transfer, disposal (up to "disposed", not after)
- Loan/issue-and-return
- Audit (scan-based, session-locked)
- Reports, rebuilt, by role/audience
- Requests with time-windowing and role-based types
- Security/integrity fixes (concurrency, uniqueness, scope checks, session invalidation)
- Mobile-only QR scanner

**Explicitly out of scope — do not build, do not let scope back in:**
- Consumables and expiring/perishable assets (pens, paper, lab chemicals, anything "used
  up") — confirmed out of scope by Yanet. Track only non-consumable assets.
- Anything after an item reaches `DISPOSED` status (auction, resale, garage handling) —
  confirmed out of scope; the college's responsibility once marked disposed.
- Maintenance, calibration, incident records — deferred past phase 1, not this cycle.
- Live map tracking, routing, multi-building navigation — if built at all, it's a single
  pin on a static college map image/basic map library. No GPS live tracking.
- Salaries/HR, procurement bidding, social/chat features, AI gimmicks (carried over from
  the original build plan, still correct).

---

## 1. Final role model (locked — 12 Oct decision)

**Five roles**, matching the change specification (2.1) as amended on 12 Oct: the spec's
`ACCOUNT_ADMIN` is merged into `SYSTEM_ADMIN`, so one role owns both jobs. The campus and
university tiers are cut for phase 1: college and campus are the same level here and the
deployment is one campus, so `college → department` are the only live tiers. Registering the extra tiers would
build structure nothing in this demo exercises.

| Role (spec enum) | Registers items? | Sees on scan | Approves |
|---|---|---|---|
| `STAFF` | No | **Own property only** | Nothing |
| `DEPARTMENT_HEAD` | No | Own property only (can also be assigned and claim items like any user) | Transfers originating in their department |
| `PROPERTY_OFFICER` | **Yes** | Full detail on every scan | Cross-department transfers, disposal, losses |
| `AUDITOR` | No | Full detail, read-only | Runs audits; approves nothing |
| `SYSTEM_ADMIN` | No | — | Account approval, privileged invites and configuration only — the spec's `ACCOUNT_ADMIN` job folded in; approves nothing business-related |

**Locked by Yanet's message:** item registration belongs to property officers only — the
two-type-of-staff idea from her earlier chat is dropped. Scan visibility is explicit: staff
see only their own items; property officers see everything; a department head can hold and
claim items like anyone else.

**Cut by the 12 Oct decision:** `CAMPUS_PROPERTY_OFFICER` and the university-wide
`PROPERTY_ADMIN`. Their work belongs to `PROPERTY_OFFICER` in phase 1. The AAU-wide
hierarchy research stays in `property-hierarchy-and-roles-plan.md` for a future rollout;
re-adding a tier later is an additive change to the role enum and its scope fields, not a
rewrite of the permission layer.

**Locked 12 Oct — `ACCOUNT_ADMIN` is merged into `SYSTEM_ADMIN`.** Yanet proposed it ("not
much responsibility" to keep separate) and the team confirmed it, so there is one role, not
two: `SYSTEM_ADMIN` owns account approval, privileged invites, the deactivation of heads and
auditors, and system configuration, and still sees no asset data. Splitting it back out later
is a permission check, not a schema change — but the build target is the merged role.

**Dropped 12 Oct — `DEPT_RECORD_KEEPER`.** The change spec has no such role and Yanet's
confirm-list answer was "refer to the md". Keep `DEPARTMENT_HEAD` only. If a department later
asks for a record keeper it is an additive permission row, not a rework.

---

## 2. Item lifecycle (locked — states taken from spec 4.2)

```
                    ┌→ DISPOSED                (approved disposal; permanent)
                    ├→ LOST                    (audit MISSING, failed verification, officer report)
PENDING_CLAIM → ACTIVE ├→ LOANED               (open loan; blocks transfer and disposal)
                    └→ REVERTED_UNVERIFIED     (holder deactivated; department must verify and claim)
VOIDED — wrong entry or duplicate; only while unclaimed with no transfer history (spec 4.8)
```

- The spec's 4.2 enum predates the loan decision, so **`LOANED` is added** to it. "In use vs
  in store" is not a status: it is derived from the holder (a staff member holds in use, the
  college pool is store).
- **Claim handshake:** creating an item assigns it to a holder and puts it in
  `PENDING_CLAIM`; the holder claims it (a department head claims on behalf of the department);
  refusing returns it to the college pool with a mandatory reason; an unclaimed item reverts
  to the pool after 14 days (spec 4.4). The current exemption for imported items is still open —
  an unclaimed imported item is exactly the one worth chasing.
- **Custody event log:** every claim, refusal, expiry, reversion, transfer, disposal and loss
  writes an append-only row. This is the evidence base for loss and liability, and it is spec
  Tier 1 — it cannot slip to a later phase.
- Registration: property officers only. College level only (12 Oct tier decision).
- Every non-consumable asset gets tracked — "everything gets tracked, including pens and
  clippers" was the original interview finding, but Yanet's decision narrows this to
  **non-consumable assets only**. That is the rule to build to.
- `condition` field: keep the enum **already in the database** — `NEW | GOOD | FAIR | DAMAGED |
  BEYOND_REPAIR` — instead of the four-value draft in the earlier version of this plan. A drop
  in condition requires a note (photo optional) so a custodian cannot quietly hide damage.
- Unique, lifetime PIN per item, DB-level uniqueness constraint.
- Soft delete only — nothing is ever hard-deleted; `VOIDED` and `DISPOSED` are statuses.

---

## 3. Transfer (locked)

- **Holder, not owner.** An item's custodian is exactly one of: a staff member, a department,
  or the college (spec 4.1). `ownerId` is removed (spec 11.3) — it is a user id and cannot
  express a department or the college.
- The transfer records both sides explicitly: `fromHolderType` / `fromHolderId` and
  `toHolderType` / `toHolderId`. Never one ambiguous field.
- Types: department→department, department→individual, individual→department, and either
  direction to or from the college pool.
- Approval required from both sides; the person who initiates a transfer can never also
  approve it.
- Multiple pending requests on one item: **default policy** (not yet confirmed, but
  needed to ship) — first valid request in the queue is granted; competing requests are
  marked `WAITLISTED` with a reason, not silently dropped. Flag this as a default when you
  present it; it's cheap to change the ordering rule later since it's one function, not a
  schema decision.

---

## 4. Disposal (locked, scope-limited)

```
Initiate (reason: OLD | BROKEN | LOST | STOLEN) → approval → status = DISPOSED
```

- Per Yanet: disposal **ends at `DISPOSED`**. No destination tracking, no proceeds, no
  auction workflow — that's the college's job physically, outside this system.
- Still require a reason and an approver who isn't the initiator (this is a one-line rule,
  not scope creep — it's the minimum control needed so disposal isn't self-approved).
- Second-approver-above-a-threshold (from the earlier review) is **not required** by
  Yanet's reply — build single-approver disposal for now. Worth a one-line mention at the
  demo that this was simplified on purpose, not missed.

---

## 5. Loan / issue-and-return (locked — build now, iterate later)

Minimum viable version for this phase:
- Borrower, item, due date, return condition.
- Approver (the officer who releases it).
- Status: item moves to `LOANED` (added to the enum in §2), which blocks transfer and
  disposal until it is returned.
- Overdue flag once past due date (a simple boolean/badge is enough for phase 1 — no
  escalation workflow, no automated incident creation yet; that's a defensible "iterate
  later" cut given the time constraint).

---

## 6. Audit (locked — built to the 10-step summary sent to Yanet)

1. The auditor opens a session and picks the scope: one department, one building, or the college.
2. **At open, the in-scope item list is frozen** and the session gets a number. Items registered
   or transferred afterwards belong to the next audit. (Today the list is worked out at close,
   so an item moved during the audit silently changes the outcome.)
3. The auditor scans each item in the mobile app. Outcome is one of: `FOUND`, `DAMAGED`,
   `LOCATION_MISMATCH`, `MISSING` — the existing `AuditItemResult` enum plus `DAMAGED`.
4. Unscanned items stay "not found yet" until close. After close the department gets **one
   grace window (default 7 days — still to confirm)** to produce them, then `MISSING` → `LOST`
   through the existing loss and liability workflow (spec 4.9).
5. Close produces the **audit report**: scope, the frozen list, counts per outcome, reasons,
   evidence photos, auditor sign-off. A numbered artifact, not a screen.
6. Before sign-off only the auditor sees it; after sign-off the department head sees it and
   **responds** (cannot edit) and the Property Officer acts on it.
7. Every finding becomes a task with an owner and a due date, closed only when the auditor
   verifies the fix.
8. A verified item records `last_verified_at` / `last_verified_by` — this is the field that
   ties audit to the reports and makes "not verified since <date>" possible.
9. `HANDOVER` is a session type: the same machinery, run when a department head changes.
10. Four types: annual full count, spot check, compliance, handover.

- Audit page needs: filter by department, date range, status; sort; CSV/PDF export.
- No duplicate rows per item per session — DB-level uniqueness constraint.
- Sessions close permanently: results become uneditable and timestamped.
- The only detail still open is the grace-window length in step 4.

---

## 7. Requests (locked)

- Types: self-use (staff), department-use (dept head), transfer-to-department,
  transfer-to-individual, disposal-initiate, loan.
- Request list is **time-windowed by default** (this week/month, or custom range) — never
  an unfiltered dump. Totals/history shown as a separate report/export.

---

## 8. Reports (locked structure, simplified for the team's capacity)

Yanet was honest that the finance/statutory language wasn't something she could evaluate —
so the reporting feature is being built to the *simplest version that's still real*, not
the full accounting-grade version. This is a deliberate scope cut to keep the team moving:

**Phase-1 reports (build these):**
| Audience | What it shows |
|---|---|
| Department | Their items, current status, pending requests |
| College | Register for the college, disposal log, transfers |
| Auditor | Full audit history, variances, exports |

*(The university/central row from the earlier draft is cut with the tier decision of 12 Oct —
it returns with a university-wide rollout.)*

**Explicitly deferred (not this phase, needs finance input the team doesn't currently have):**
- Depreciation / book value / useful life tracking
- Ethiopian fiscal year (Hamle–Sene) period-locking
- MoF/FPPA-specific export format
- Heritage-asset depreciation flag
- IFMIS reconciliation export

This deferral is the honest answer to "reports were totally not working" — the original
complaint was about *missing data linkage* (reports not matching audit/transfer records),
which Phase-1 reports fix. The *financial* reporting (depreciation, ministry formats) is a
separate, genuinely harder problem that needs someone with accounting/finance background
to specify correctly — flag this openly at the demo rather than quietly skipping it.

**Reports ↔ audit integration (locked, answers the "only one line links them" gap):**
Every report reads from the same underlying tables as audit and transfer records — no
separate "reporting" dataset that can drift out of sync. A loss report is generated directly
from `audit.status = MISSING → confirmed LOST`, not maintained as a parallel manual list.

**Frozen when official, live when internal (12 Oct decision).** One rule, applied everywhere:

- **Official outputs are snapshotted at generation.** Anything exported, submitted, or shown as
  "the audit result" is frozen with the parameters used and a serial number. Re-running it later
  must not change what it said — otherwise it is not a record.
- **Internal views stay live.** Dashboards and list pages ("items currently pending", "open
  loans") recalculate on load; they are working screens, not records.
- A report is therefore either **draft** (live numbers) or **official** (frozen). The audit
  report is frozen when the session closes, which is the same pattern §6 step 5 already needs.

---

## 9. Public / guest access (default — proceed, confirm later if challenged)

Yanet didn't respond to this point directly, and her own blanket rule was "assume
agreement if not challenged." Building per the original proposal:
- No `GUEST` role in the system.
- Anonymous visitors see a static informational page: what the system is, who may use it,
  how to request an account, Property Office contact, sign-in link. No item data, no
  building list with no purpose.

---

## 10. Bulk import images (default — proceed)

No response from Yanet on this either; proceeding with the minimum viable version:
- Bulk import supports an optional image column per row (URL or file reference).
- Images stored with the item record; no retention/expiry policy needed since images are
  tied 1:1 to a non-deleted item record (soft-delete keeps them, same as the item).

---

## 11. Email (locked: keep it; provider still open)

- Confirmed: keep email verification/notifications as a security feature — accepted even
  with spam-folder risk for @aau.edu.et addresses.
- Provider/cost/volume: **not yet decided.** Default for phase 1: a free-tier transactional
  email provider (e.g. Resend or Brevo free tier, low volume is fine at this scale) — pick
  one, document it, swap later if the team gets institutional email access. This is a
  config choice, not an architecture choice, so it's safe to decide unilaterally and change
  later without rework.

---

## 12. Map (locked, minimal)

Per Yanet: not a priority. If built — single pin showing user location on a static college
map image, using a free library (e.g. Leaflet with a static image overlay, not live GPS
routing). No further scope beyond this unless time allows after everything else ships.

---

## 13. Real-time updates (locked)

30-second polling, not SSE — Yanet's explicit call, citing lower compute cost. Build
accordingly; this is reversible later if it becomes a real performance problem, but not
worth the complexity now.

---

## 14. Security & integrity — mandatory, non-negotiable regardless of time pressure

These are small, cheap fixes relative to their risk, and skipping them is the kind of gap
a reviewer finds immediately:
1. Server-side permission checks on every route (never trust client-side role display).
2. Optimistic locking on item edits (prevents silent overwrite when two officers edit the
   same item).
3. DB-level uniqueness on PIN and on audit result rows.
4. Session/token invalidation on role change.
5. Rate limiting + lockout on login.
6. Public/unauthenticated endpoints never return internal fields (cost, custodian, exact
   location) — stripped server-side, not just hidden in the UI.

---

## 15. Build order — mandatory first, then essential-for-demo, in sequence

### Phase A — Mandatory (from Yanet's spec file, build first)
1. Role model rework (§1) — five roles (the merged `SYSTEM_ADMIN`), scope fields, permission
   matrix, item-registration locked to `PROPERTY_OFFICER`.
2. Scan visibility split: staff see their own items only, property officers see all (§1).
3. Holder model (§3): holder type + holder reference on Item, `ownerId` removed, transfers with
   explicit from/to holder fields.
4. Account flow (12 Oct decision): staff request → `SYSTEM_ADMIN` (which owns the
   account-admin responsibilities) approves → account created. The applicant still sets their own password at registration — no
   admin-set passwords and no credentials by email. *(Note: with an applicant-supplied password
   there is nothing for a "forced password change" step to trigger, so the plan's earlier
   wording of that step drops out; if the team wants admin-issued passwords instead, that
   reverses spec 3.3.7 / 12.5 — flag before building it.)*
5. Item lifecycle (§2): the state machine including `PENDING_CLAIM`, `REVERTED_UNVERIFIED`,
   `LOANED` and `VOIDED`, the claim handshake, the condition enum, and a unique lifetime PIN.
6. **Custody event log** (spec Tier 1) — append-only, written by every lifecycle and custody
   change; nothing else about loss or liability works without it.
7. **Remove hard delete and the public item routes** (spec Tier 1 #3, gap-analysis E1): the
   public item routes, the public QR behaviour and the 410 response go in this phase, not in
   polish — a public route that returns item detail is a legal exposure, not a UI choice.
8. **Optimistic locking + DB-level uniqueness** (§14 items 2–3) — they are one column and one
   constraint each, and they are expensive to retrofit.

### Phase B — Core workflows (essential for next demo)
9. Transfer workflow with dual approval, no self-approval (§3).
10. Disposal workflow, single approver, ends at `DISPOSED` (§4).
11. Loan / issue-and-return, minimum viable (§5).
12. Audit: freeze at open → scan → close → grace window → findings become tasks (§6).
13. Requests: typed, time-windowed list, totals as separate report (§7).

### Phase C — Reports and integrity
14. Phase-1 reports by audience (§8) — live internal views, frozen official reports, no
    parallel dataset.
15. Remaining security/integrity fixes (§14) — do these alongside C, not after; they're cheap
    now and expensive to retrofit later.

### Phase D — Polish (only after A–C are solid)
16. Desktop QR scanner removed, mobile-only.
17. Public informational page (§9).
18. Bulk import with optional image column (§10).
19. Email provider wired in (§11).
20. Map, minimal pin version, if time allows (§12).
21. Polling at 30s (§13).

**Do not start Phase D work before Phase A–C are demo-ready.** If time runs out, Phase D
items are the ones to visibly cut and explain, not the ones to half-build.

### Build status — 12 Oct

**Landed:** the Phase A data model, as an **expand → contract** step so the app builds and
the suite stays green throughout (`backend/prisma/schema.prisma`):
`Department` with an optional head, holder fields on `Item`, the full state machine with the
claim fields, lifetime `pin` with a database uniqueness constraint, the append-only
`CustodyEvent` log, `Item.version` for optimistic locking, account status, audit session type
/ report number / per-item uniqueness, and the audit result values the review asked for.**Verified:** `prisma validate` clean · client regenerated · `tsc --noEmit` clean · **412
tests passing across 30 files**.

**Landed 12 Oct (later) — Phase A items 1 and 2, the role slice:**

- `enum Role` is now the **five** spec roles (`SYSTEM_ADMIN`, `PROPERTY_OFFICER`,
  `DEPARTMENT_HEAD`, `STAFF`, `AUDITOR`). Migration
  `20261012010000_role_five_role_enum` maps the old `ADMIN` account to `SYSTEM_ADMIN` (the
  persona the seed calls "System Admin") and leaves `STAFF` alone; it is **applied** to the
  shared dev database.
- **One permission matrix**: `backend/src/services/permissions.ts` holds the capability table
  from spec 2.2, and routes ask `requireCapability(...)` instead of naming roles. Item creation
  is `PROPERTY_OFFICER`-only, account administration is `SYSTEM_ADMIN`-only, audits are
  `AUDITOR`-only, request decisions go to the officer and the department head.
- **Scan-visibility split**: staff see their own holdings, a department head sees their
  department, officers and auditors see the college, and a `SYSTEM_ADMIN` sees no asset data.
  The item listing is scoped the same way, and a custodian's edit to an item is narrowed to
  condition and notes (identity and financial fields stay with the officer).
- The seed now creates three logins — `admin@` (SYSTEM_ADMIN), `officer@` (PROPERTY_OFFICER),
  `staff@` (STAFF).

**Landed 12 Oct (later still) — both clients on the five roles:**

- **Web.** `frontend/src/lib/permissions.ts` mirrors the backend matrix and every screen branches
  on a capability rather than a role name: the accounts screen is the System Admin's, the
  catalogue and item registration are the Property Officer's, the decide panel and the review
  badge follow `REQUEST_DECIDE`, the audit history/"Start an audit" split follows `AUDIT_VIEW`
  vs `AUDIT_RUN`, and the custodian picker follows `USER_READ`. The old `isAdmin` booleans are
  gone; a role change is now a picker plus a confirmation that names the new role (and says the
  account's sessions end with it), instead of a one-way "Promote".
- **Mobile.** `mobile/lib/models/permissions.dart` is the same matrix in Dart,
  `AuthState` exposes `can*` getters and providers, the More sheet shows Accounts to the System
  Admin and Categories to the Property Officer (they used to share one gate), and the router
  now gates `/items/new` (`ITEM_CREATE`), `/audit/new` and the in-session scan (`AUDIT_RUN`),
  the history/report screens (`AUDIT_VIEW`) and the exports (`REPORT_VIEW_ALL`) — a deep link
  without the capability gets the shared 404, not a 403 page.
- **Fixtures followed the roles.** The suites sign in as the role each flow actually belongs to
  (Property Officer for the workbench, System Admin for accounts, Auditor for the audit
  walkthrough), which is how the role boundaries are covered rather than assumed.
- **Verified:** backend `tsc` + eslint clean, **412 tests green**; web `tsc` + eslint clean,
  **185 tests green**; mobile `flutter analyze` clean, **51 tests green**.

**Still deferred to the contract step, with their code changes:** dropping `Item.ownerId` and
the free-text `department`.

**Next in Phase A:** the holder model and transfer fields (item 3), the account-approval queue
(item 4), the claim handshake + custody writes (items 5–6), and the security items (7–8).

---

## 16. Questions to pre-empt at the next demo (supervisor + property officers)

Prepare short, confident answers for these — they're the most likely follow-ups given
what's been simplified or deferred:

1. *"Why isn't maintenance/calibration tracked?"* — Deliberately deferred past phase 1 to
   land the core registration/transfer/disposal/audit loop correctly first; it's a planned
   second-phase addition, not an oversight.
2. *"Why doesn't disposal track what happens after?"* — Confirmed out of scope with the
   team; once marked disposed, the college's physical handling (auction, scrap) is outside
   this system's responsibility.
3. *"Where's the depreciation/financial reporting?"* — Flagged honestly: this needs
   accounting-domain input the team doesn't currently have to specify correctly; Phase-1
   reports fix the *data accuracy* complaint (reports not matching audit/transfer records),
   financial valuation is a defined next step, not abandoned.
4. *"Why polling instead of real-time push?"* — Deliberate cost/complexity trade-off at
   this scale; documented, reversible later.
5. *"How do you stop someone editing the same item at once and losing data?"* — Optimistic
   locking is in place (§14) — be ready to demo two sessions editing one item live.
6. *"Why don't property officers need a second approver for disposal?"* — Simplified
   on purpose for this phase; flagged as an easy addition (one more approval step) if the
   university requires it.
7. *"What stops a non-owner from editing another department's item?"* — Scope checks
   compare IDs server-side on every write (§14), not just hidden in the UI — demo a denied
   attempt live if possible, it's the strongest kind of proof.

---

## 17. What's genuinely still open (carry forward, don't let it block building)

These need real answers eventually but nothing above depends on them to start:
- Multiple-pending-request priority rule beyond the simple default (§3).
- The audit grace window before "not found" becomes `LOST` (§6 step 4) — default 7 days.
- Whether the claim-expiry exemption for imported items stays (spec 4.6 / 6.8) — an unclaimed
  imported item is the one most worth chasing.
- Finance/statutory reporting, once someone with the right background can specify it (§8).
- Email provider selection, once institutional email access is confirmed or ruled out (§11).

**Closed on 12 Oct, no longer open:** the campus/university tier question (cut), the account
approval flow (admin queue kept), the `ACCOUNT_ADMIN`/`SYSTEM_ADMIN` split (merged into one
role), `DEPT_RECORD_KEEPER` (dropped), and report freshness (frozen official / live internal).

**Spec synced 12 Oct:** `cncs_pms_change_specification.md` was edited to match the three
decisions — 3.1 now names the `SYSTEM_ADMIN` (not the department head) as the registration
approver, 2.1 / 2.2 / 3.2 / 3.4 / 11.1 / 14.1 carry the five-role set with the Account Admin
merged, and 3.3.7 / 12.5 are confirmed as removed (`mustChangePassword` and the admin-set
password route), so the plan and the spec no longer disagree.

None of these block Phase A–C. Build to the defaults above and revisit if the team pushes
back — every default chosen here was picked specifically because it's cheap to change
later without reworking the foundation underneath it.
