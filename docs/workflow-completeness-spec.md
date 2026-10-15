# Workflow Completeness — Requests, Transfers, Handover, and Every Handshake

**Purpose:** this fills the gaps that "approval exists" hid — every place where custody
actually changes hands needs a confirm-or-decline step from the person taking possession,
not just a decision from the person with authority. Without this, the system can say an
item belongs to someone who never actually received it, which is worse than not tracking
it at all, because it looks authoritative.

---

## 0. The pattern, stated once, applied everywhere

```
INITIATE  → someone starts the action (request, assignment, handover trigger)
APPROVE   → someone with authority over the SOURCE and/or DESTINATION signs off
CONFIRM   → the person who will actually hold the item acknowledges receipt
            (condition confirmed, or refused with a reason)
```

Registration already has step 3 (`claim`/`refuse-claim`). **Every other custody-changing
action below gets the same step 3, not a new mechanism — the same `PENDING_CLAIM` state
machine, `claimedAt`, `claimDueAt`, and refuse path, reused.** This is a generalization of
existing code, not new infrastructure.

Why this matters, concretely: if Staff B never confirms receiving a transferred laptop and
it later turns up missing, the system currently has no record of whether B ever actually
had it — the approval only proves a head *authorized* the move, not that it *happened*.

---

## 1. Requests — full lifecycle, including the missing states

### 1.1 Current gap
A request can be `PENDING → PENDING_STAGE1 → PENDING_STAGE2 → APPROVED/REJECTED`. There is
no way for the requester to change their mind, and no handling for what happens to a
request if the underlying item's state changes while it's pending.

### 1.2 Real scenario forcing this
An instructor requests a transfer of a projector to their office, then is reassigned to a
different building the next day before approval happens. The request is now meaningless,
but nothing lets them cancel it — it just sits in a head's queue as a stale decision to
make, or gets wrongly approved into a transfer nobody wants anymore.

### 1.3 Build: request withdrawal
- New status: `WITHDRAWN`.
- `POST /requests/:id/withdraw` — only the original requester, only while status is
  `PENDING`, `PENDING_STAGE1`, or `PENDING_STAGE2` (not after any approval has moved it
  further — once a stage has approved, require the requester to ask that approver to
  reject instead, so the approver's decision is still the one of record).
- Logged the same as any other decision, with `reason` optional but encouraged.

### 1.4 Build: stale-request invalidation
When an item's status changes outside of a request (e.g. it gets disposed, voided, or
another request on it completes first), every other `PENDING*` request on that same item
is automatically moved to a new status `INVALIDATED` with an auto-generated reason
("item status changed before this request could be decided"), and the requester is
notified. This closes the race condition §3 of the roles spec already named ("multiple
pending requests on one item") but didn't fully resolve — the waitlist logic handles
*competing* requests; this handles a request whose premise disappeared entirely.

---

## 2. Transfers — add the claim step for individual recipients

### 2.1 Current gap
Dual-stage approval (releasing head, receiving head) completes the transfer. Neither stage
confirms the *physical recipient* actually took the item.

### 2.2 Real scenario forcing this
A transfer from Department A to a specific person, Staff C, in Department B. Both heads
approve. But Staff C is on leave for two weeks and the item sits in a hallway, unclaimed,
while the system confidently reports Staff C as the custodian. If it goes missing in that
window, the record is wrong about who had it last.

### 2.3 Build: claim-on-transfer-to-individual
- `TRANSFER_TO_INDIVIDUAL`, once both stages approve: item status → `PENDING_CLAIM`,
  `claimedAt = null`, `claimDueAt = now + N days` (same default window as registration).
- Recipient (Staff C) gets `POST /items/:id/claim` (confirm condition matches record, or
  flag a discrepancy) or `POST /items/:id/refuse-claim` (reason required — e.g. "never
  received it," "wrong item," "damaged beyond what's recorded").
- Refusal: item reverts to its prior holder, both heads notified, logged as a disputed
  transfer — this is a real event worth a department head's attention, not a silent revert.
- Claim expiry (`claimDueAt` passed, no action): auto-escalate to the Property Officer with
  a notification — don't leave it silently stuck.

### 2.4 `TRANSFER_TO_DEPARTMENT` — no individual claim needed
Correctly stays as-is: once both heads approve, the item enters the receiving department's
pool (`holderType: DEPARTMENT`). No single person is being made individually accountable,
so there's no one specific to claim it — the receiving head's approval **is** the
department's acceptance. This is intentionally asymmetric with §2.3, not an inconsistency.

---

## 3. Loans — claim to start, a real handshake to end

### 3.1 Current gap (start side)
Same issue as transfer: `LOAN_APPROVE` flips status to `LOANED` directly. Nothing confirms
the borrower actually picked the item up.

### 3.2 Real scenario
A head approves a projector loan for a conference next week. The system marks it `LOANED`
immediately, overdue-tracking starts from the approval date — but the borrower doesn't
actually collect it until three days later. The "overdue" clock is now wrong, and if
someone else needs the projector in that gap, the system incorrectly shows it unavailable
from the approval moment, not the actual pickup moment.

### 3.3 Build: claim-on-loan-start
- `LOAN_APPROVE` → item status → `PENDING_CLAIM` (loan variant, same mechanism).
- Borrower claims → **now** item status becomes `LOANED`, and `loanDueDate` is calculated
  from the claim timestamp, not the approval timestamp, so a loan period means what it says.
- Claim expiry: loan auto-cancels, item reverts to available, approver notified — don't
  leave a phantom "approved but never collected" loan sitting active.

### 3.4 Current gap (return side) — the bigger one
Audit of the codebase found `returnLoan` exists as a function, but it's not clear anything
lets the *borrower* initiate it — the current design implies the lender/approver checks
items back in, which depends entirely on them remembering to, rather than the borrower
being able to act.

### 3.5 Real scenario forcing the return handshake
A borrower returns a laptop to the department office in person. The person they handed it
to isn't the one who approved the original loan and doesn't know to log a return. The
system continues showing the item `LOANED` and eventually overdue, even though it's
sitting on a shelf, because nothing recorded the physical handback.

### 3.6 Build: return-initiation handshake
```
Borrower: POST /requests/:id/return-initiate
  → status: RETURN_PENDING_CONFIRMATION
Lender/Property Officer: POST /requests/:id/return-confirm (condition check)
  → item status: ACTIVE (or IN_STORE), loan closed, loanReturnedAt set
  OR POST /requests/:id/return-dispute (reason — e.g. "not actually returned",
     "returned but damaged, not matching claim")
  → escalates to Property Officer for resolution, does not silently close the loan
```
This gives the borrower agency to say "I'm done with this," and gives the confirming party
a chance to actually verify condition before the loan record closes — matching how the
claim handshake already protects the registration side.

---

## 4. Disposal — correctly has no claim step, but needs an evidence/dispute path

### 4.1 Why disposal is different, on purpose
Disposal terminates custody — there's no new holder to confirm receipt of nothing. Single
approval remains correct. Don't add a claim step here; it would be meaningless.

### 4.2 What's still missing
If a disposed item is later found (e.g. someone discovers it wasn't actually scrapped), the
spec currently has no defined correction path other than "a special, recorded correction"
mentioned in passing in the original build plan — never made concrete.

### 4.3 Build: disposal reversal
- `POST /items/:id/reverse-disposal` — Property Officer only, requires a reason, writes a
  `CustodyEvent` explaining the correction, item status returns to `IN_STORE` (not back to
  its pre-disposal holder automatically — someone has to re-register custody properly,
  since the original holder relationship may no longer be accurate after time has passed).

---

## 5. Handover — department head change, the "biggest missing control"

This was already flagged by the audit as the single largest gap. Reasoning it through
fully, not just naming it:

### 5.1 Real scenario
Dr. X, head of Biology, is replaced by Dr. Y. At the moment of transition: Dr. X personally
held 3 items, the department pool holds 40 items "under X's oversight," and there are 2
pending approvals sitting in X's queue. If nothing structured happens, Dr. Y inherits
responsibility for 40+ items they've never seen, with no way to know if the records are
even accurate, and the 2 pending approvals either vanish or sit forever.

### 5.2 Build: structured handover, not a silent reassignment
```
SYSTEM_ADMIN activates new head (Dr. Y) for the unit
  → unit.headUserId = Dr. Y
  → every department-held item (holderType: DEPARTMENT, this unit) → status flag
    REVERTED_UNVERIFIED (schema field already exists per the audit — use it)
  → Dr. X's personally-held items: NOT auto-transferred. Dr. X remains the holder of
    record until a real transfer happens — a role change doesn't silently move personal
    custody, that would be exactly the kind of "fixed the number quietly" problem audits
    exist to prevent.
  → Dr. X's pending approvals: reassigned to Dr. Y's queue, each logged as
    "reassigned on handover," not silently appearing with no trail.
```

### 5.3 The new head's obligation: a forced verification pass, not a rubber stamp
- Dr. Y gets a dedicated screen: "Department items pending your verification" — every item
  in `REVERTED_UNVERIFIED` for their unit.
- For each: `CONFIRM` (I've confirmed this is accurately recorded — condition, location)
  or `FLAG` (something's wrong — missing, wrong condition, wrong location), with a reason.
- This is structurally identical to an audit's FOUND/MISSING marking, reusing the same
  mechanism, scoped to the handover event specifically — the item's state machine doesn't
  need a new branch, the handover is just "an audit triggered by a leadership change."
- A `FLAG`ged item creates the same review path as an audit MISSING finding (§8.4→4.9 of
  the original spec) — confirmed lost, or re-checked.
- Until an item is `CONFIRM`ed, it cannot be transferred or disposed — the new head has to
  actually look at it first. This is the enforcement that makes this a real control, not a
  suggestion.

---

## 6. Claim refusal and condition disputes — apply uniformly

Every claim point above (registration, transfer-to-individual, loan-start) uses the same
refuse path. Define it once, use everywhere:

- `refuse-claim` always requires a reason, from a fixed set plus free text: `NEVER_RECEIVED`,
  `WRONG_ITEM`, `CONDITION_MISMATCH`, `OTHER`.
- `CONDITION_MISMATCH` specifically: the claimant can accept custody while flagging the
  recorded condition as wrong (e.g. record says Good, item is actually Damaged) — this
  isn't a refusal, it's an accept-with-correction. Build this as a third path:
  `POST /items/:id/claim-with-correction` (body: actual condition, note) — logged, and the
  item's condition field updates to the corrected value with the correction itself on
  record in the audit trail, so there's a difference between "the record was wrong" and
  "someone quietly changed the condition field later."

---

## 7. Expiry and escalation — one consistent mechanism, applied to every pending-human-action state

Every state above that waits on a specific person (claim, approval, return-confirm,
handover verification) needs the same two things, which currently exist for approval
escalation (§5 of the authority doc) but nowhere else:

1. A configurable **window** (default: reuse `APPROVAL_ESCALATION_DAYS`, or a dedicated
   `CLAIM_WINDOW_DAYS` if claim windows should differ from approval windows — decide once,
   apply everywhere, don't invent a new default per feature).
2. An **escalation target** when the window passes: claim expiry → Property Officer.
   Loan-return-confirm expiry (lender never confirms a borrower-initiated return) →
   Property Officer, since an unconfirmed return sitting too long is itself a red flag.
   Handover verification expiry → SYSTEM_ADMIN, same pattern as a vacant/stale approval.

Build this as one shared scheduled check (or lazy-on-read, matching how approval escalation
is already built), not a bespoke timer per feature.

---

## 8. Concurrency — what happens when reality and the system disagree mid-flow

### 8.1 Approver deactivated mid-queue
If a department head is deactivated while they have pending approvals/claims-to-verify
assigned to them, those don't just vanish — on deactivation, run the same reassignment
logic as §5.2's handover (even if this isn't a formal head-change, just a deactivation),
so nothing is ever silently orphaned in a disabled user's queue.

### 8.2 Item status changes under a pending claim
If an item somehow gets voided or disposed while `PENDING_CLAIM` (e.g. a Property Officer
catches a data-entry mistake), the pending claim is invalidated the same way §1.4 handles
stale requests — notify whoever was about to claim it, don't leave a claim action pointing
at an item that no longer exists in that state.

---

## 9. Catalog visibility and reporting — the gaps found by role-by-role reasoning

### 9.1 Staff — restricted catalog browse (new capability, new visibility tier)
Not full Browse Items (that leaks cost/custodian/exact room). Not public category-only
either (Staff is authenticated and has a real reason to identify a specific item to
request). New visibility tier: **`item name, category, general location (building only,
not room), current status (available / in use / loaned)`** — enough to request something
specific without seeing who has it or what it's worth. Add nav item "Catalog" for STAFF,
backed by a dedicated endpoint (not a cut-down version of the officer's `/items` route —
build it as its own query so the field restriction is structural, not a client-side filter
that could be bypassed).

### 9.2 Staff and Department Head — personal holdings export
`GET /items/held-by-me/export?format=csv|pdf` — a simple, dated record of current holdings.
Serves both self-protection ("here's what I had as of this date") and informal handover
between colleagues. Low complexity, meaningfully closes a real accountability gap.

### 9.3 Department Head — missing from the Reports audience entirely
Add "Reports" to Department Head's nav, scoped to `REPORT_RUN_DEPARTMENT` (capability
already defined in §3 of the monolithic doc) — the capability exists, the nav entry and
the screen behind it don't yet.

### 9.4 Auditor — consolidated reporting beyond one session at a time
Per-session CSV/report already works. Add a date-range "evidence pack" export aggregating
multiple completed sessions for a scope — this is what "control-test extracts" in §10's
audience matrix actually implies, and nothing currently produces it.

---

## 10. Account recovery — the gap nobody designed

### 10.1 Real scenario
A legitimate, active Department Head forgets their password. T7 (deactivation) and T6
(invite) exist; nothing exists for "still-valid user, locked out, needs back in."

### 10.2 Build: password reset
- `POST /auth/request-password-reset` (email) — identical response whether the email
  exists or not (same anti-enumeration pattern already used in `request-account`).
- Single-use, expiring token, emailed.
- `POST /auth/reset-password` (token, new password) — on success, `tokenVersion` bumps
  (kills any old sessions, same as every other credential-affecting action in this spec).
- No admin, of any role, ever sees or sets another user's password — this reset flow is
  the *only* path back in for a locked-out legitimate user, keeping the "admin never
  touches passwords" rule (already established for invites) consistent everywhere.

---

## 11. Summary table — every handshake in the system, now consistent

| Action | Initiate | Approve | Confirm/Claim | Decline path |
|---|---|---|---|---|
| Registration | Property Officer | — | Assigned holder | `refuse-claim` |
| Transfer → individual | Requester | Stage1 + Stage2 heads | Recipient | `refuse-claim`, reverts to prior holder |
| Transfer → department | Requester | Stage1 + Stage2 heads | — (head's approval is acceptance) | reject at either stage |
| Loan start | Borrower | Approving head | Borrower (claim) | `refuse-claim`, loan cancelled |
| Loan return | Borrower (initiate) | — | Lender (confirm) | `return-dispute`, escalates |
| Disposal | Property Officer / College officer | Property Officer | — (terminal) | reject; or `reverse-disposal` later |
| Handover | SYSTEM_ADMIN (activates new head) | — | New head, per item | `FLAG`, same as audit MISSING |
| Account request | Applicant | Unit head / SYSTEM_ADMIN | — (account activation is the confirmation) | reject, with reason |
| Privileged invite | SYSTEM_ADMIN | — (the authorizedBy/ref fields ARE the approval record) | Invitee (accept-invite, sets password) | link expires, unused |

Every row with a Confirm/Claim column uses the same underlying mechanism. This is the
point: the system isn't missing nine different features, it's missing one generalization
applied eight more times.
