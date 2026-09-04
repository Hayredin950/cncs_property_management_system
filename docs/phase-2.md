# Phase 2 — Workflows & Notifications

Covers SRS F2.2 (accessories), F2.3 (edit history), F6 (transfer approval), F7 (disposal),
F8 (notifications). Backend only.

Two things to know before reading further:

- **No schema change.** Phase 2 added no columns, no indexes and no migration, so pulling it
  requires nothing beyond `pnpm install`. Every design decision below that could have been
  solved with a new column was solved without one instead; where that cost something, it says so.
- **Phase 1's Items track landed after Phase 2 was written**, and the two have since been merged.
  The item-facing rules that shipped as service contracts are now wired into real routes; what
  changed on both sides, and the two conflicts that had to be settled from the SRS/SDS, is in
  [Integration with the Items track](#integration-with-the-items-track).

## What shipped

Every router is mounted twice — under `/api/v1` (the SDS path) and under its bare path, which is
what Phase 1 shipped and what its tests still call. Both reach the same handler.

| Endpoint | Who | What it does |
|---|---|---|
| `POST /requests` | Staff, Admin | Files a TRANSFER or DISPOSAL. Notifies every reviewer in the same transaction. |
| `GET /requests?status=&type=&mine=&limit=&offset=` | Staff, Admin | Review queue for an admin; own requests only for staff. |
| `GET /requests/pending-count` | Staff, Admin | Badge count, same scoping. |
| `GET /requests/:id` | Staff, Admin | 404 — not 403 — when it isn't yours (D4). |
| `POST /requests/:id/approve` | Admin | Applies the change, cascades to accessories, writes the audit trail, notifies the requester. |
| `POST /requests/:id/reject` | Admin | `{ rejectionReason }`. Writes no item change and no history rows. |
| `GET /items/:id/history?field=&limit=&offset=` | Staff, Admin | Edit trail, newest first. Disposed items included on purpose. |
| `POST /items/:id/accessories` | Staff, Admin | Links 1–20 existing items into a bundle. |
| `DELETE /items/:id/accessories/:accessoryId` | Staff, Admin | Unlinks one accessory. |
| `GET /notifications?unread=&limit=&offset=` | Any signed-in user | Own inbox only, plus an unread count. |
| `POST /notifications/:id/read` | Any signed-in user | Own rows only. |

Supporting middleware and services, all with their own tests:

| Module | Purpose |
|---|---|
| `middleware/errorHandler.ts` | Central `{ error, details? }` handler + `notFoundHandler`. Malformed JSON → `400 Invalid JSON body`; unknown error → `500 Internal server error`. |
| `middleware/validate.ts` | `validateBody` / `validateQuery` → `req.validated` (Express 5 makes `req.query` read-only). 400 body byte-identical to `routes/auth.ts`. |
| `lib/httpError.ts` | `httpError(status, message, details?)` — the only way a rule inside a transaction can both roll it back and keep its status code. |
| `services/requestWorkflow.ts` | The state machine and the one transaction that has to be right. |
| `services/itemEditLog.ts` | D1 serialization + diffing. **Called by `PUT /items/:id` and by the approval path.** |
| `services/notifications.ts` | D2 fan-out and the D3 message templates. |
| `services/itemVisibility.ts` | The F7.2 `where`-clause helpers and F7.3's message. |
| `services/email.ts` | `NOTIFY_EMAIL`-gated stub transport (F8.3). |
| `utils/filterItemFields.ts` | SDS 3.2 field stripping (`sanitizeItem`) — Phase 1's, reused rather than duplicated. |

17 test files, 236 tests. `pnpm run build` type-checks the tests too, so vitest passing is not
the same as CI passing — run both.

## The state machine

```
                 POST /requests
                       │
                       ▼
                   ┌────────┐   POST /:id/approve   ┌──────────┐
                   │PENDING │ ────────────────────▶ │ APPROVED │
                   └────────┘                       └──────────┘
                       │        POST /:id/reject    ┌──────────┐
                       └──────────────────────────▶ │ REJECTED │
                                                    └──────────┘
```

Both decided states are terminal — there is no reopen, no un-approve, no delete. A mistaken
approval is corrected by filing the opposite request, which leaves both decisions in the history.

Only one PENDING request may exist per item (D5), so the diagram is per-item as well as
per-request.

### Order inside `applyDecision`

Defined in `services/requestWorkflow.ts`; the numbering matches the comments in the code.

1. **Read the reviewer** from the database and check `role === "ADMIN"`. The JWT already carries
   a role, but a token issued before a demotion still claims ADMIN, so the row has the last word.
2. **Read request + item + requester** in one query with explicit `select` blocks. Never
   `include: { item: true }` — that would start leaking whatever column the Items track adds next.
3. **Refuse, cheapest and most specific first:** own request → 403; not PENDING → 409; item
   already disposed → 409.
4. **Resolve the change set.** TRANSFER re-verifies `newOwnerId` against `User` (it is a bare
   `String` with no foreign key, so it can dangle) → 400 if missing. DISPOSAL sets `status`,
   `disposalReason` = the request's own reason, and `disposedAt`.
5. **Compare-and-swap the request** — `updateMany({ where: { id, status: "PENDING" } })`,
   `count === 0` → 409.
6. **Compare-and-swap the item** — `updateMany({ where: { id, status: "ACTIVE" } })`,
   `count === 0` → 409.
7. **Cascade to accessories** — one `findMany`, one `updateMany`, whatever the bundle size.
8. **Write the audit trail** — one `createMany` for the parent's rows and every accessory's.
9. **Notify the requester** — one row, inside the transaction, so a decision cannot commit
   unnotified.

Then, **after the commit and outside the transaction**, the email side-channel. Zero network I/O
happens inside `prisma.$transaction`: it holds a pooled Neon connection for its whole duration.

Four reads, at most four writes plus one notification. Options are
`{ maxWait: 5000, timeout: 15000 }` because Neon cold starts routinely blow past Prisma's 2 s
default `maxWait`.

### Why ReadCommitted is enough

Step 5 running before step 6 is the entire concurrency guard, and it is worth being precise about
what it buys.

Two admins click Approve on the same request at the same instant. Both transactions read a PENDING
row in step 2 and pass every rule in step 3 — nothing there can distinguish them. Then both reach
step 5, and `UPDATE ... WHERE id = ? AND status = 'PENDING'` is atomic: the second one blocks until
the first commits, re-evaluates its `WHERE` against the committed row, matches nothing, and reports
`count === 0`. It throws 409 `Request has already been decided` and rolls back **before touching
the item**, so the transfer is never applied twice and the audit trail never gains a second set of
rows claiming the same move.

The same shape guards the item in step 6: if someone disposed the item while this request sat in
the queue, `WHERE id = ? AND status = 'ACTIVE'` matches nothing and the approval aborts with 409
rather than silently reviving a disposed item.

Raising the isolation level to Serializable would add nothing here — the compare-and-swap already
makes the losing transaction fail — and would cost something real: `P2034` serialization failures
that need an application-level retry loop, on a database whose cold starts are already the
timeout risk. So isolation stays at Prisma's default.

What this does **not** protect against is a `where` clause that loses its status guard in a later
refactor. `where: { id }` alone passes every mock-based test in `routes/requests.test.ts` while
silently deleting the race guard. The test that catches it asserts the *ordering* —

```ts
const requestOrder = vi.mocked(prisma.request.updateMany).mock.invocationCallOrder[0];
const itemOrder = vi.mocked(prisma.item.updateMany).mock.invocationCallOrder[0];
expect(requestOrder as number).toBeLessThan(itemOrder as number);
```

— and the `where` clauses are asserted by value alongside it. Both matter; neither is a substitute
for the [manual walkthrough](#manual-walkthrough), which is the only place this code meets real
Postgres.

## Who may decide

**ADMIN only.** `requireRole(["ADMIN"])` on the route, and `applyDecision` re-reads `role` from the
database and checks it again.

SRS §9 lists the reviewer role as an open question and never resolves it, so there is no spec to
violate either way. The alternative considered was a `User.canReview` flag with an admin endpoint to
toggle it, which is more flexible and defensible on paper — and it was dropped, because it would
have meant a migration on the shared Neon database, a new endpoint, and coordination with whoever
touches `User` in Phase 3, all for a question the SRS authors deliberately left open. ADMIN-only is
one line, needs no schema change, and is equally defensible. Revisit it when someone actually asks
for a non-admin reviewer.

**Nobody decides their own request**, admin included — 403 `You cannot decide your own request`,
checked before the status check because "you may not decide this at all" stays true regardless of
what the status becomes. The test that an ADMIN requester still gets 403 is what proves this is not
merely role-gating.

## Notifications

### D2 — who is told a request needs review

`Request.reviewedById` is null at submit time, so there is nobody specific to notify: the fan-out
goes to everyone who is *allowed* to decide it.

```ts
reviewerRecipientsWhere(requesterId) // → { role: "ADMIN", id: { not: requesterId } }
```

The requester is excluded even when they are an admin — they already know, and they are barred from
deciding it anyway. One `createMany` inside the same transaction that creates the request, so a
request can never exist with nobody told about it. An empty recipient list skips the write and
`console.warn`s: a request nobody can see is an operational hazard, not a validation error, so the
request is still created but the log says so loudly.

### D3 — message templates

`Notification` has no `type` column and Phase 2 adds no migration, but the frontend needs to branch
on what happened (icon, colour, where a click goes). So the code lives in the message as a
bracketed prefix and is stripped back out by the API:

```
[REQUEST_SUBMITTED] Demo Staff requested a TRANSFER for item CNCS-DEMO-0001 (Dell Latitude Laptop) and it needs your review.
[REQUEST_APPROVED] Your TRANSFER request for item CNCS-DEMO-0001 (Dell Latitude Laptop) was approved by System Admin.
[REQUEST_REJECTED] Your DISPOSAL request for item CNCS-DEMO-0003 (Microscope) was rejected by System Admin. Reason: Item is still serviceable.
```

`GET /notifications` returns `{ id, code, message, relatedRequestId, isRead, createdAt }` with the
prefix removed and `code` as its own field. `parseNotificationMessage` matches
`/^\[([A-Z_]+)\]\s*([\s\S]*)$/` against the three known codes and falls back to
`{ code: null, message: raw }` for anything else — an unprefixed row, an unknown code, a row
inserted by hand. **That fallback is what makes the scheme safe with no schema change and no
backfill**: every row still displays, it just has no code to branch on.

Messages always name things by `tagId` and `fullName`, never by uuid — a person reads these.
`rejectionReason` is capped at 500 characters (`MAX_REJECTION_REASON_LENGTH`).

If a `type` column ever gets added, `parseNotificationMessage` is the single place to change, and
old rows keep working through the same fallback.

### Reading your inbox

`GET /notifications` and `POST /notifications/:id/read` run `authenticate` with no `requireRole`: a
notification belongs to a person, not a role, and there is no "read someone else's inbox"
capability for anyone, admin included. `userId` is pinned last in every `where` object literal, so
no query parameter can widen the scope — `?unread=true` can only narrow it.

`POST /notifications/:id/read` uses `updateMany({ where: { id, userId } })` and 404s on
`count === 0`. Plain `update({ where: { id } })` is an IDOR: any signed-in user could mark any other
user's notification read by guessing an id. `count === 0` also covers "no such notification" with
the same 404, so the response never confirms that an id it may not touch exists.

### Email (F8.3)

Off unless `NOTIFY_EMAIL` is one of `1 / true / yes / on`. **The SMTP transport is a stub** — with
the flag on, `services/email.ts` logs what it would have sent and returns `"sent"`; with it off it
returns `"skipped"`; it never throws, so a committed decision is never reported as a failure
because a mail server was unreachable. Every response that triggers email carries the outcome as
`emailStatus`.

Real SMTP was left out on purpose: it needs a dependency, a regenerated lockfile in a parallel
branch, and credentials nobody on the team has, for the requirement SRS names second-to-cut. In-app
notifications (F8.1, F8.2) are the real delivery mechanism and do not depend on this file. Going
live means replacing the body of one function, `deliver()`.

`NOTIFY_EMAIL` is read *inside* `isEmailNotifyEnabled()`, never at module load — reading env at
import time is what forced the dynamic-import gymnastics in `qrGenerator.test.ts`.

## Edit history (F2.3, F6.3)

**One `ItemEditLog` row per changed field**, never one row per edit. An approval that moves an item
from floor 3 / room 312 to floor 1 / room 101 writes two rows, and `GET /items/:id/history` can then
answer "when did the room last change" with `?field=room` instead of making the client parse a blob.

`fieldChanged` is always the exact Prisma field name — `ownerId`, not `owner` — taken from the
closed list `TRACKED_ITEM_FIELDS`. Deliberately excluded: `id` and `tagId` (immutable identifiers,
SDS 3.2), `registeredAt` (set once), `lastAuditedAt` (maintained by the Phase 3 audit run, not a
user edit).

### D1 — value serialization

`oldValue` and `newValue` are `String?`, but the tracked columns include Decimal, DateTime, enums
and uuids, so every value needs one agreed textual form:

| Value | Stored as | Why |
|---|---|---|
| `null` / `undefined` | SQL `NULL` | Never the string `"null"`, which is indistinguishable from a user typing it. |
| Decimal (`purchaseCost`, `currentValue`) | `"45000.00"` | Two places, so `45000` and `45000.00` never read as a change. |
| DateTime | ISO 8601 UTC | Sorts and compares as text. |
| boolean | `"true"` / `"false"` | — |
| enum | the schema's own name, e.g. `"DISPOSED"` | Matches what the API and the database show. |
| string | trimmed | — |
| foreign key (`ownerId`, `categoryId`, `parentItemId`) | `"Demo Staff (a3f1…)"` | Both halves: a bare uuid is unreadable, and a bare name breaks the moment someone is renamed. |

A field whose serialized value is unchanged produces **no row** — no-ops are never logged. A field
absent from the update payload is untouched and also produces no row, which is why `diffItemFields`
compares only the keys named in `after`.

### Correlating one decision's rows

Every row written by a single approval shares an exact `editedAt`, created once before the
transaction opens and also written to `Request.decidedAt` and (for a disposal) `Item.disposedAt`.
**That timestamp is the correlation key.**

The alternative was an `ItemEditLog.requestId` column, which would be a better key — it is explicit,
and it survives two decisions landing in the same millisecond. It was dropped with the rest of the
migration. The cost is real but small: grouping by `editedAt` is exact in practice because one
decision writes one `createMany` with one timestamp, and `Request.decidedAt` gives you the join back
to the request. Two different decisions colliding on the same millisecond *and* touching the same
item is the only case that would confuse a reader, and D5 (one PENDING request per item) makes it
close to impossible.

If a later phase adds the column, `buildEditLogRows` is the one place to thread it through.

### Reading it

`GET /items/:id/history` is Staff/Admin. SRS 3.4 gives the item's owner no special access: the
history is an audit trail, and "who changed the cost, and when" is management information rather
than something an owner needs about their own desk.

Ordering is `[{ editedAt: "desc" }, { fieldChanged: "asc" }]`. The second key is load-bearing —
rows from one decision share an exact `editedAt`, so without it their order is whatever Postgres
feels like returning.

Disposed items keep their history and it stays readable: the lookup goes through `allItemsWhere()`,
an identity function whose only job is to make "disposed included on purpose" greppable. F7.2 keeps
disposed rows in the table precisely so this works.

## Accessories and the cascade (F2.2)

### D6 — the rules

| Rule | Behaviour |
|---|---|
| Body shape | `{ "accessoryItemIds": ["id", …] }`, 1–20 entries. `{ "accessoryItemId": "id" }` is accepted and normalised to the array form. |
| Duplicate ids in one payload | De-duplicated, so listing the same id twice writes one history row. |
| Inline item creation | Not supported. A new accessory needs a Tag ID, and the generator belongs to the Items track, which does not exist. Register the item first, link it by id. |
| Item as its own accessory | 400 `An item cannot be its own accessory` |
| Cycle | 409 `That link would create a cycle in the bundle`, detected by walking the parent chain upward with a hard hop cap so a pre-existing cycle in the data cannot spin forever. |
| Max depth | **2.** The parent must have `parentItemId === null`, and no accessory may already have accessories of its own. Either violation is 409 `A bundle may only be 2 levels deep`. |
| Re-parenting | Allowed, and logged as a `parentItemId` change like any other edit — both bundles' tagIds appear in the row. |
| Either item DISPOSED | Linking is 409 `Item is already disposed`, with the offending tagIds in `details`. |
| Unlinking a disposed item | **Allowed.** Unlinking is how a mistaken bundle gets corrected; refusing it would freeze bad data in place. |
| Linking during a pending request | Allowed. Bundle membership is metadata, not state the approval contends with. |

Cycle is checked *before* depth so the more accurate error wins: asking to make A an accessory of
its own accessory B is a cycle, not merely a too-deep bundle, even though the depth rule would also
have rejected it.

Depth 2 because SRS F2.2 describes a flat bundle and SDS 3.2 lists `accessories` as one restricted
field, not a tree. The practical payoff: "direct accessories" and "all accessories" are the same
set, so the cascade below stays a single `updateMany` with no recursion.

### The cascade

**Approving a request propagates to the bundle.**

| Request | Propagated to every ACTIVE accessory |
|---|---|
| TRANSFER | `building`, `floor`, `room`, `ownerId` — whichever the request actually named |
| DISPOSAL | `status = DISPOSED`, `disposedAt`, and `disposalReason = "Disposed with parent item CNCS-DEMO-0001: <reason>"` |

`parentItemId` is preserved on disposal — the bundle stays recorded as a bundle in the history.

A charger whose record still says Room 312 after the laptop moved to Room 101 is knowingly-wrong
data, and F7.2 exists precisely so the system stops lying about where things are. The objection —
this mutates records the requester never named — is answered by logging, not by declining to
cascade: every propagated field on every affected accessory gets its own `ItemEditLog` row with the
same `editedById` and the same `editedAt` as the parent's rows. Nothing is silent. If a bundle
genuinely should not move together, unlink it first.

The test that catches a half-implemented cascade asserts the parent's and the child's rows arrive in
one `createMany` sharing one timestamp:

```ts
expect(rows?.map((row) => `${row.itemId}:${row.fieldChanged}`)).toEqual(
  ["item-1:floor", "item-1:room", "item-4:floor", "item-4:room"]);
expect(new Set(rows?.map((row) => row.editedAt))).toHaveProperty("size", 1);
```

## Decision register (D1–D7)

Seven questions the SRS and SDS leave open. Recorded here so Phase 3 can build on them instead of
relitigating them; each links to the reasoning above.

| # | Question | Decision |
|---|---|---|
| D1 | How are typed values stored in `ItemEditLog.oldValue` / `newValue`? | One agreed textual form per type; `NULL` never becomes `"null"`; foreign keys render as `"<name> (<id>)"`. [Table](#d1--value-serialization) |
| D2 | Who is notified that a request needs review, when `reviewedById` is still null? | Every ADMIN except the requester, in the request-creation transaction. [Detail](#d2--who-is-told-a-request-needs-review) |
| D3 | How does the frontend branch on notification type without a `type` column? | A `[CODE]` prefix inside `message`, stripped by the API, with an unprefixed fallback. [Detail](#d3--message-templates) |
| D4 | Which status code for each refusal? | [Table below](#d4--status-codes) |
| D5 | May an item have two pending requests? | No — 409 on the second. |
| D6 | How deep may a bundle nest, and what happens on approval? | Depth 2, and approval cascades with full logging. [Table](#d6--the-rules) |
| D7 | How is "disposed items disappear from `GET /items`" delivered with no `GET /items`? | As unit-tested helpers plus a written contract, not a throwaway route. [Detail](#contract-for-the-items-track) |

### D4 — status codes

| Situation | Code | `error` |
|---|---|---|
| Deciding your own request | 403 | `You cannot decide your own request` |
| Not an ADMIN | 403 | `Insufficient permissions` (existing string, `middleware/auth.ts`) |
| Re-deciding a decided request | 409 | `Request has already been decided` |
| Item already disposed (at create or at decide) | 409 | `Item is already disposed` |
| Second PENDING request for one item | 409 | `This item already has a pending request` |
| `newOwnerId` names no existing user | 400 | `newOwnerId does not match an existing user` |
| TRANSFER naming neither a location nor an owner | 400 | `A transfer request must change the location or the owner` |
| Staff reading another user's request | 404 | `Request not found` |
| Marking another user's notification read | 404 | `Notification not found` |
| Unknown route | 404 | `Route not found` |
| Malformed JSON body | 400 | `Invalid JSON body` |

403 for self-approval because F6.2 is an authorization rule, not a payload or state problem. 409 for
re-decision because it conflicts with the resource's current state. 404 rather than 403 for another
user's request or notification because the scope is part of the `where` clause — the response cannot
confirm that an id it is not allowed to see exists. 400 rather than 422 throughout, because 400 is
the only validation code this codebase uses.

### D5 — one PENDING request per item

Two pending TRANSFERs approved in sequence silently double-move the item, and the second decision's
`oldValue` no longer describes what the first reviewer saw when they approved. Serializing costs one
`findFirst` inside the creation transaction. Accessory linking is deliberately *not* blocked by a
pending request — it is bundle metadata, not contending state.

### Revisions to the plan this shipped against

Two departures from the approved Phase 2 plan, both narrowing:

- **No `User.canReview` flag** — approval is ADMIN-only. Reasoning in
  [Who may decide](#who-may-decide). The plan's slice for `routes/users.ts` and
  `PATCH /users/:id/reviewer` is therefore not built.
- **No migration at all.** Dropping `canReview` removed the only *required* schema change, so
  `ItemEditLog.requestId` and the seven proposed indexes were dropped with it rather than touching
  the shared Neon database for a nice-to-have. Consequences are recorded in
  [Correlating one decision's rows](#correlating-one-decisions-rows) and in
  [What Phase 3 needs](#what-phase-3-needs).

## Integration with the Items track

Phase 2 was written against a `main` where Phase 1's Items & Categories track did not exist. It
landed afterwards, and merging the two is the work described here. The merge itself conflicted in
exactly one file (`src/app.ts`, one mount line); everything below is deliberate integration on top
of that.

Phase 1 brought `POST /items`, `GET /items`, `GET /items/:tagId`, `PUT /items/:id`, the
`/categories` router, the `CNCS-XXXXXXXX` tag generator, and `utils/filterItemFields.ts`.

### The three rules that were waiting for a call site

| Rule | Now enforced at | Test that proves it |
|---|---|---|
| F7.2 — disposed items leave the default listing | `GET /items` → `activeItemsWhere(filters)` | `routes/items.test.ts` → *"defaults to page 1 / limit 20 and only ever lists ACTIVE items"*, *"cannot be talked into listing disposed items from the query string"* |
| F7.3 — public lookup of a disposed tag | `GET /items/:tagId` → `410 DISPOSED_PUBLIC_MESSAGE` | *"answers a disposed tag with F7.3's sentence and nothing else"* |
| F2.3 — one history row per changed field | `PUT /items/:id` → `buildEditLogRows` + `writeEditLogRows` | *"writes one edit-log row per changed field and none for a no-op"* |

`allItemsWhere()` still has no caller. That is intended: it exists so Phase 3's disposal report can
say "disposed rows are included on purpose" in a way that greps, because a `where` with no `status`
key is indistinguishable from one that forgot it.

### C1 — two implementations of SDS 3.2, one kept

Phase 2 shipped `publicItemView` (an allow-list) while Phase 1 shipped `sanitizeItem` (a deny-list).
Two field lists that must agree forever is a bug with a delay on it, so one had to go.
**`sanitizeItem` was kept and `publicItemView` deleted**, for three reasons, in order of weight:

1. SDS 3.2 prescribes that exact shape: *"check if the requester is logged in AND their `id`
   matches the item's `ownerId` (or they're Staff/Admin). If not, **strip** `ownerId`'s user
   details, `purchaseCost`, `currentValue`, `brand`, `model`, `serialNumber`, `notes`, and
   `accessories` from the response object before sending it."* Strip, plus the owner branch — that
   is a deny-list, described field by field.
2. Its list matches SRS 3.4's visibility table and Phase 2's did not. `publicItemView` published
   `brand` and `model`, which the table hides, and omitted `photoUrl`, which the table shows. On
   the question the specs actually settle, the surviving implementation was the correct one.
3. It is already wired into three call sites with its own tests.

An allow-list is still the safer *mechanism* — a deny-list publishes any column added after it was
written, and the SRS acceptance criterion is that the public never sees a hidden field "under any
circumstance, including via direct URL manipulation". The mitigation, rather than overruling the
SDS: `RESTRICTED_FIELDS` is kept wider than SRS 3.4's table. It also strips `parentItemId` (the
inverse edge of `accessories` — the same relation, so publishing it would hand out a sibling item's
id while hiding the list), `editLogs` and `requests` (edit history is ❌ for the public *and* the
owner), and `disposalReason` / `disposedAt`. Re-read that set whenever `Item` grows a column.

Note the owner branch is currently unreachable as a distinct case: `Role` has exactly two members,
so every authenticated user is already Staff or Admin. It is kept because SRS F4.3 describes it and
a third role would make it live.

### C2 — who the disposed-tag 410 applies to

Phase 1's `GET /items/:tagId` returned 410 to *everyone* for a disposed item. F7.3 is a rule about
the public — "not scannable/viewable by the public" — while F7.2 says a disposed item "remains
queryable in reports/history" and SRS 3.4 gives Staff/Admin every field. An admin who scans a
disposed tag needs the record, not an error.

So the 410 is now gated on `isPrivilegedViewer(req.user)`: the public gets F7.3's sentence, Staff
and Admin get the row. The status code and the wording are Phase 1's and unchanged — 410 Gone is
right for a tag that resolves to something deliberately withdrawn, and the message is the SRS's own
sentence rather than a paraphrase. Proven by *"answers a disposed tag with F7.3's sentence and
nothing else"* and *"still returns the record to an admin scanning a disposed tag (F7.2)"*.

The body is `{ "error": "This item is no longer in service" }` and nothing else — no tagId, no
name, no reason. "Nothing else" is F7.3's own phrase.

**The status code is the one thing here the SRS does not settle**, so it stayed as Phase 1 built it.
F7.3 says only what the lookup "shows"; 410 and `200 { status, message }` both satisfy that
sentence. 410 Gone is semantically exact for a tag that resolves to something deliberately
withdrawn. The argument for 200 is a frontend one and it is not weak: this is a sticker on a
physical object, and a scan handler that receives `410 { error }` will most likely render "scan
failed" rather than "this asset was disposed" unless someone special-cases the one endpoint in the
API that answers 410. If the frontend team wants 200 plus an explicit `status: "DISPOSED"` and the
same sentence in a `message` field, that is a two-line change here and one test name — raise it
before the UI is written, not after.

### Other changes made to Phase 1 files, and why

- **`parentItemId` is rejected by `POST` and `PUT /items`** with a 400 naming the right endpoint.
  It was accepted as a plain uuid on create. `POST /items/:id/accessories` is where the bundle
  rules live (no self-parenting, no cycles, max depth 2 — D6); a second unguarded writer to the
  same column lets a three-deep chain A → B → C form, and the approval cascade is one
  `updateMany({ where: { parentItemId } })` by design, so it would move B and silently leave C
  behind claiming a room it is not in. Rejected loudly rather than stripped silently, so the caller
  learns where the field lives.
- **`PUT /items/:id` had its own inline diff loop**, which stringified with `String(value)` — so a
  `Decimal` logged as `45000` where the approval path logs `45000.00`, a `null` logged as the
  string `"null"`, and an `ownerId` logged as a bare uuid. Two formats in one table make the
  history unreadable across sources. It now calls the same helpers the approval path does.
- **`PUT /items/:id` refuses a disposed item** with `409 Item is already disposed`, and its write
  is a compare-and-swap on `status: "ACTIVE"` — the same guard the approval transaction uses,
  because a DISPOSAL approval committing between the read and the write would otherwise be
  overwritten. `status`, `disposalReason` and `disposedAt` are absent from the route's schemas, so
  it cannot dispose or un-dispose an item either.
- **`POST /items` retries a tag-id collision.** `tagId` is `@unique` and generated from four random
  bytes; by the birthday bound a registry of 10,000 items has roughly a 1-in-100 chance of drawing
  the same tag twice, and the caller — who never supplied the value — would read a constraint
  error. Retried against the unique index rather than pre-checked with a `findUnique`, since
  check-then-create is itself a race. Narrowed to `tagId`, so a collision on any other unique
  column still surfaces.
- **`PUT /items/:id` 400s a dangling `ownerId` or `categoryId`** instead of letting Prisma's P2003
  surface as a 500, and reads both names in one query when a foreign key actually changes, for
  D1's `"<display name> (<id>)"` form.
- **`/categories` and `/items` now hand errors to the central handler.** Both had
  `catch { res.status(500).json({ error: "Failed to ..." }) }`, which dropped the error object
  entirely — a database outage produced a fixed string and no stack trace anywhere.
- **`errorHandler` maps three Prisma constraint failures off 500**: P2002 → 409, P2003 → 400,
  P2025 → 404, with generic messages so the ORM's own text (which names tables and columns) is
  never echoed. Routes that can say something more specific still check first and get there first.

### Still open

- **`seed.ts`'s `CNCS-DEMO-000n` tags deliberately do not match the generated format.** Nothing
  reads the format — lookup is an equality match and the QR payload is a URL built around whatever
  the tag is — and the walkthrough below is pasted by hand, where `DEMO-0001` is legible and
  `CNCS-8F2A91C4` is a typo waiting to happen. The follow-up comment that asked for re-alignment
  has been closed with this reasoning; it is not an oversight.
- **`purchaseCost` and `currentValue` are `Prisma.Decimal`** and `GET /items` now returns them to
  Staff/Admin. `JSON.stringify` renders a Decimal as a string, not a number, so the frontend will
  receive `"45000"`. Phase 2 selects no cost column anywhere and did not have to solve this;
  whoever builds the UI should decide the shape deliberately rather than discover it.
- **`docs/phase-1.md` arrives in #9**, along with a filled-in `CONTRIBUTING.md` and a CI workflow
  that no longer skips docs-only PRs. Until that merges, the [Inherited gaps from Phase
  1](#inherited-gaps-from-phase-1) section below is the only written record of what Phase 1 shipped
  and what it left open.

## Inherited gaps from Phase 1

Phase 1's Items & Categories track was not built when Phase 2 started, and this section recorded
what that cost. It has since landed and been integrated — see
[Integration with the Items track](#integration-with-the-items-track). The four exit criteria that
shipped as service contracts are now enforced at real routes, with route tests:

| Exit criterion | Substitute at the time | Now |
|---|---|---|
| Disposed item disappears from default `GET /items` | `activeItemsWhere` + override-resistance test | `GET /items`, route-tested |
| …but is still fetchable via history and reports | `GET /items/:id/history` on a DISPOSED item | unchanged — reports are Phase 3 |
| F7.3 public lookup of a disposed tag | `DISPOSED_PUBLIC_MESSAGE` unit test | `GET /items/:tagId` → 410, route-tested |
| Every `PUT /items/:id` writes a history row | helper tested, call site documented | `PUT /items/:id`, route-tested |

One gap outlives the merge: **there is still no test database.** Every route test is mock-based, in
CI and locally. A mock cannot catch a wrong `where` clause — `where: { id }` in place of
`where: { id, status: "PENDING" }` passes every assertion and silently removes the race guard that
the whole approval design rests on. The [manual walkthrough](#manual-walkthrough) is the only thing
that exercises the transaction against real Postgres, which is why it is a checklist and not
polish. Standing it up needs a `db` service in `docker-compose.yaml`, a conditional adapter in
`lib/prisma.ts` (the Neon WebSocket adapter cannot talk to a plain Postgres), and a `services:`
block in the CI workflow. That is a change to shared infrastructure and belongs to whoever owns
Phase 3.

## Schema change log

**None.** `backend/prisma/schema.prisma` is byte-identical to `92c0841`; no migration was created and
the shared Neon database was not touched. Pulling Phase 2 needs no `prisma migrate` and no
`prisma generate`.

Models Phase 2 uses, all pre-existing and already migrated: `Request`, `ItemEditLog`, `Notification`,
and the `Item` self-relation (`parentItemId` / `accessories`) that backs bundles.

Considered and rejected, with reasons in
[Revisions to the plan](#revisions-to-the-plan-this-shipped-against): `User.canReview`,
`ItemEditLog.requestId`, and indexes on `Request(status)`, `Request(itemId)`,
`Request(requestedById)`, `ItemEditLog(itemId, editedAt)`, `Notification(userId, isRead)`,
`Item(status)`, `Item(parentItemId)`. The indexes are pure performance and remain worth adding —
they are exactly the columns this phase's queue queries and Phase 3's reports scan. They belong in
whichever migration Phase 3 opens anyway, not in a migration of their own.

## Seed data

`pnpm prisma:seed` (from `backend/`) is idempotent and now sets up the whole workflow demo:

| Fixture | Id / tag | Notes |
|---|---|---|
| Admin | `admin@cncs.aau.edu.et` / `Admin123!` | The only role that can decide a request |
| Staff | `staff@cncs.aau.edu.et` / `Staff123!` | Files requests; gets 403 deciding their own |
| Laptop | `CNCS-DEMO-0001` | Owned by staff, CNCS Building floor 3 room 312 |
| Charger | `CNCS-DEMO-0004` | **New.** `parentItemId` = the laptop, so the cascade is demoable |
| Pending request | `seed-req-0001` | TRANSFER of the laptop to floor 1 room 101, filed by staff |
| Notification | `seed-notif-0001` | Unread `[REQUEST_SUBMITTED]` row in the admin's inbox |

Two things about idempotency worth knowing, because the trap is easy to re-introduce:

- `upsert` with `update: {}` is a **no-op on an existing row**. The seed therefore gives the request
  and the bundle explicit `update` payloads that rewind them — status back to `PENDING`,
  `reviewedById` / `decidedAt` back to null, the two demo items back to ACTIVE at floor 3 room 312.
  Without that, the walkthrough below could be run exactly once ever: its disposal step sets
  `status = DISPOSED`, and every later step would 409 from then on.
- The rewind is scoped to the two `CNCS-DEMO` tags and the two `seed-` ids it owns. It does **not**
  rewind `ItemEditLog`: history is append-only, and a trail that grows across demo runs is correct.

The notification text is rendered by the same `renderRequestSubmitted` helper the API uses, so the
seeded row cannot drift from the D3 template.

`prisma/seed.ts` is neither type-checked by `pnpm build` (tsconfig `include` is `src/**/*.ts`) nor run
in CI. Run it by hand and read the output.

## Manual walkthrough

**Every route test in this phase is mock-based.** There is no test database and no Postgres in CI, so
this sequence is the only place the approval transaction meets real Postgres — and a mock cannot catch
a `where` clause that lost its `status` guard. It is verification, not polish.

> **Status: not yet run.** No `.env` exists in this checkout, so nothing here has been executed
> against Neon. Run it and paste the output into the integration PR before the final merge.

```bash
docker compose up --build     # repo root; backend on :4000
pnpm prisma:seed              # from backend/
```

```bash
BASE=http://localhost:4000/api/v1
login() { curl -s "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq -r .token; }

STAFF=$(login staff@cncs.aau.edu.et 'Staff123!')
ADMIN=$(login admin@cncs.aau.edu.et 'Admin123!')
```

| # | Step | Expected |
|---|---|---|
| 1 | `GET /notifications` as admin, then as staff | Admin has an unread `[REQUEST_SUBMITTED]` row with `code: "REQUEST_SUBMITTED"` and **no** `[...]` prefix in `message`; staff's inbox is empty |
| 2 | `POST /requests/seed-req-0001/approve` as **staff** | 403 `You cannot decide your own request`, and nothing changed |
| 3 | Same call as **admin** | 200. `cascadedItemIds` names the charger; `editLogRowCount` is 4 |
| 4 | `GET /items/<laptop-id>/history` as admin | Rows for `floor` and `room` on both items, all four sharing one `editedAt`; `oldValue` `"3"` → `newValue` `"1"` |
| 5 | Repeat step 3 | 409 `Request has already been decided` |
| 6 | Staff files a DISPOSAL on the laptop, admin approves | Laptop `status=DISPOSED` with `disposalReason` and `disposedAt`; charger disposed too, its reason reading `Disposed with parent item CNCS-DEMO-0001: …` |
| 7 | Staff files any request on that laptop | 409 `Item is already disposed` |
| 8 | `GET /items/<laptop-id>/history` again | Still 200 with the full trail — disposal is not a delete (F7.2) |
| 9 | `POST /notifications/<admin-notif-id>/read` as **staff** | 404 `Notification not found` (the IDOR guard) |
| 10 | `POST /requests` twice in a row on one ACTIVE item | Second is 409 `This item already has a pending request` |
| 11 | `GET /api/v1/requests` and `GET /requests` | Identical bodies |
| 12 | `GET /nope` | 404 JSON `{"error":"Route not found"}`, not an HTML page |
| 13 | `POST /requests` with `-d '{"type":'` | 400 `{"error":"Invalid JSON body"}`, not an HTML page |
| 14 | `GET /items` with **no** token, after step 6 | The disposed laptop and charger are absent (F7.2); no `purchaseCost`, `brand`, `model`, `serialNumber`, `notes`, `ownerId` or `owner` on any row (SDS 3.2) |
| 15 | `GET /items?status=DISPOSED` with no token | Still no disposed rows — the query string cannot widen the filter |
| 16 | `GET /items/CNCS-DEMO-0001` with no token, then as admin | 410 `{"error":"This item is no longer in service"}` and nothing else for the public (F7.3); 200 with the full row including `disposalReason` for the admin (F7.2) |
| 17 | `PUT /items/<desk-id>` as staff with `{"room":"105"}`, then `GET /items/<desk-id>/history` | 200, then one new row: `fieldChanged: "room"`, `oldValue: "101"`, `newValue: "105"` — and no row for any field you did not send |
| 18 | `POST /items` as staff with `"parentItemId":"<any-id>"` | 400 pointing at `POST /items/:id/accessories` |

Step 17 uses `CNCS-DEMO-0002` (Office Desk, room 101), not the laptop or the charger — those are
DISPOSED by step 6, and `PUT` on a disposed item is a 409 on purpose. Its id is not in the seed's
output; read it from `GET /items?search=Office%20Desk` with a staff token.

Steps 3–4 are the ones worth reading carefully: they are the only end-to-end proof that the cascade
touches the accessory and that both items' history rows land in one decision. Steps 14–17 are the
integration's equivalent — the three item-facing rules that had no call site until Phase 1's Items
track landed.

Sample calls for the steps that need a body:

```bash
# staff files a transfer (step 6 is the same with "type":"DISPOSAL" and no newLocation* fields)
curl -s "$BASE/requests" -H "Authorization: Bearer $STAFF" -H 'Content-Type: application/json' \
  -d '{"type":"TRANSFER","itemId":"<laptop-id>","reason":"Moving with its user to the ground floor",
       "newLocationFloor":"1","newLocationRoom":"101"}'

# admin decides
curl -s -X POST "$BASE/requests/seed-req-0001/approve" -H "Authorization: Bearer $ADMIN"
curl -s -X POST "$BASE/requests/<id>/reject" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"rejectionReason":"Item is still serviceable"}'

# link and unlink an accessory
curl -s "$BASE/items/<laptop-id>/accessories" -H "Authorization: Bearer $STAFF" \
  -H 'Content-Type: application/json' -d '{"accessoryItemId":"<charger-id>"}'
curl -s -X DELETE "$BASE/items/<laptop-id>/accessories/<charger-id>" -H "Authorization: Bearer $STAFF"
```

Item ids (not tagIds) are what these endpoints take. Read them out of the seed's own output or from
`GET /requests` — `seed-req-0001`'s `item.id` is the laptop.

## Verification

From `backend/`, per change:

```bash
pnpm install
pnpm run lint
pnpm run build     # tsc — this type-checks the .test.ts files too, which is where CI usually breaks
pnpm test          # 17 files, 236 tests
```

No `prisma generate` step is needed for Phase 2 specifically, since the schema did not change — but CI
runs it, and it is harmless locally.

## What Phase 3 needs

Phase 2 exposes no reporting endpoints. Read the three tables directly:

- **Disposal report** — `Item` where `status = "DISPOSED"`, wrapped in `allItemsWhere()` so the intent
  is greppable. `disposalReason` and `disposedAt` are populated by the approval, and an accessory
  disposed with its parent says so in its reason.
- **Transfer / edit report** — `ItemEditLog`, joined back to `Request` on
  `editedAt === Request.decidedAt`. Group by `editedAt` to reconstruct one decision including its
  cascaded accessories; there is no `requestId` column
  ([why](#correlating-one-decisions-rows)).
- **Notifications** — import `NOTIFICATION_CODES` and `parseNotificationMessage` from
  `services/notifications.js` rather than re-parsing the `[CODE]` prefix. If a `type` column ever
  lands, that function is the one place to change.

Three things to pick up:

1. **The indexes.** Listed in the [schema change log](#schema-change-log). They are exactly the columns
   the review queue and the reports scan. Fold them into whatever migration Phase 3 opens.
2. **`ItemEditLog.requestId`**, if grouping by timestamp proves awkward in practice.
   `buildEditLogRows` is the single place to thread it through.
3. **`seed.ts` re-runs are not free of surprises** in a shared database — the rewind described under
   [Seed data](#seed-data) resets the two demo items and `seed-req-0001`. If Phase 3 seeds audit
   fixtures on top of those rows, make it robust to that.

Watch out for `Prisma.Decimal`. `GET /items` returns `purchaseCost` and `currentValue` to Staff and
Admin, and `JSON.stringify` renders a Decimal as a *string* — so the API already answers `"45000"`,
not `45000`. Phase 2 selects no cost field anywhere and did not have to settle the shape; a report
that sums costs, and the frontend that renders them, both will. See
[Still open](#still-open).

## File map

Phase 2's own files:

| Path | What |
|---|---|
| `backend/src/routes/requests.ts` | Request CRUD + the two decision endpoints |
| `backend/src/routes/itemHistory.ts` | `GET /items/:id/history` |
| `backend/src/routes/accessories.ts` | Bundle link / unlink |
| `backend/src/routes/notifications.ts` | Inbox |
| `backend/src/services/requestWorkflow.ts` | `applyDecision` + the pure state machine |
| `backend/src/services/itemEditLog.ts` | D1 serialization, diffing, row writing |
| `backend/src/services/notifications.ts` | D2 fan-out, D3 templates, `parseNotificationMessage` |
| `backend/src/services/itemVisibility.ts` | `activeItemsWhere` / `allItemsWhere` (F7.2) + F7.3's message |
| `backend/src/services/email.ts` | `NOTIFY_EMAIL` stub transport |
| `backend/src/lib/httpError.ts` | `httpError()` / `isHttpError()` |
| `backend/src/middleware/errorHandler.ts` | `errorHandler`, `notFoundHandler` |
| `backend/src/middleware/validate.ts` | `validateBody`, `validateQuery`, `validated*` accessors |
| `backend/src/test-utils/index.ts` | `createToken`, `makeUser`, `makeItem`, `makeRequest`, `makeNotification` |

Phase 1 files this phase modified — all four covered under
[Integration with the Items track](#integration-with-the-items-track):

| Path | Change |
|---|---|
| `backend/src/routes/items.ts` | `PUT` rewritten around the shared edit-log helpers + a status CAS; tag-id collision retry; `parentItemId` rejected; `next(err)` |
| `backend/src/routes/categories.ts` | `next(err)` instead of a bare `catch` that dropped the error |
| `backend/src/utils/filterItemFields.ts` | `isPrivilegedViewer` export (the `:tagId` viewer gate) + a wider deny-list |
| `backend/src/app.ts` | Router mounts, `notFoundHandler`, `errorHandler` |

Each Phase 2 file has a `.test.ts` beside it except `httpError.ts` and `test-utils/`, which are
covered through their callers. `routes/items.test.ts` and the additions to
`utils/filterItemFields.test.ts` are the integration's own tests.











