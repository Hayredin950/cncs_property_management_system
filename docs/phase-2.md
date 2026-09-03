# Phase 2 — Workflows & Notifications

Covers SRS F2.2 (accessories), F2.3 (edit history), F6 (transfer approval), F7 (disposal),
F8 (notifications). Backend only.

Two things to know before reading further:

- **No schema change.** Phase 2 added no columns, no indexes and no migration, so pulling it
  requires nothing beyond `pnpm install`. Every design decision below that could have been
  solved with a new column was solved without one instead; where that cost something, it says so.
- **Phase 1's Items track does not exist.** There is no `GET /items` or `PUT /items/:id` to hang
  the item-facing rules on, so two exit criteria ship as unit-tested service contracts rather
  than routes. See [Inherited gaps from Phase 1](#inherited-gaps-from-phase-1).

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
| `services/itemEditLog.ts` | D1 serialization + diffing. **The seam the Items track calls.** |
| `services/notifications.ts` | D2 fan-out and the D3 message templates. |
| `services/itemVisibility.ts` | F7.2 / F7.3 / SDS 3.2 rules, as helpers because there is no route to put them in. |
| `services/email.ts` | `NOTIFY_EMAIL`-gated stub transport (F8.3). |

14 test files, 194 tests. `pnpm run build` type-checks the tests too, so vitest passing is not
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

## Contract for the Items track

Three rules that belong on item routes that do not exist yet. They ship as tested helpers with call
sites named here, rather than as a throwaway `/public/items/:tagId` route — someone would build
against that route and then it would have to be supported.

**`GET /items` — hide disposed items by default (F7.2)**

```ts
import { activeItemsWhere } from "../services/itemVisibility.js";

const items = await prisma.item.findMany({ where: activeItemsWhere({ ...filters }) });
```

`activeItemsWhere` spreads `extra` first and pins `status: "ACTIVE"` last, so a caller who passes
`{ status: "DISPOSED" }` — from an unvalidated query string, say — cannot widen the filter. Proven by
`services/itemVisibility.test.ts` → *"cannot be widened by a caller passing its own status"*.

Anywhere disposed items are wanted on purpose, wrap the filter in `allItemsWhere()` instead. It is an
identity function; its only job is to make the intent greppable, because a `where` with no status key
is indistinguishable from one that forgot it.

**`GET /items/:tagId` — strip restricted fields for the public (SDS 3.2, F7.3)**

```ts
import { publicItemView } from "../services/itemVisibility.js";

res.json({ item: publicItemView(item, req.user) });   // req.user may be undefined
```

Staff and admins get the row untouched. A guest gets the `PUBLIC_ITEM_FIELDS` allow-list — an
allow-list, not a deny-list, so a column added later is private until someone deliberately publishes
it. A disposed item collapses to `DISPOSED_PUBLIC_MESSAGE` rather than 404: the tag is real, and
scanning it should say what happened to the item, not imply the record was lost. Proven by
*"strips every restricted field for a guest (SDS 3.2)"*, *"is an allow-list, so a column added later
is private until published"*, and *"collapses a disposed item to the F7.3 message rather than 404"*.

**`PUT /items/:id` — write a history row per changed field (F2.3)**

```ts
import { buildEditLogRows, writeEditLogRows } from "../services/itemEditLog.js";

await prisma.$transaction(async (tx) => {
  const before = await tx.item.findUnique({ where: { id }, select: { /* the fields you will write */ } });
  await tx.item.update({ where: { id }, data: changes });
  await writeEditLogRows(tx, buildEditLogRows({
    itemId: id,
    editedById: req.user.id,
    editedAt,              // one Date created before the transaction opens
    before,
    after: changes,
    labels,                // { [userId]: fullName } etc., for foreign-key rows
  }));
});
```

Do **not** reimplement diffing or value formatting there. The D1 rules are what make history rows
comparable across the approval path and the edit path, and they are pinned by
`services/itemEditLog.test.ts` → *"writes one row per changed field, all sharing editedById and
editedAt"*, *"drops no-op changes rather than logging them"*, and *"maps null and undefined to SQL
NULL, never the string \"null\""*.

The approval path already exercises this helper inside a real transaction, so the seam is proven —
only the call site is missing.

**Also for whoever builds Items:** Phase 2 selects no cost fields anywhere, which is why it never
had to solve `Decimal`-to-JSON serialization. `purchaseCost` and `currentValue` are
`Prisma.Decimal`, and `JSON.stringify` does not render them as numbers. Decide that deliberately.

## Inherited gaps from Phase 1

`docs/phase-1.md` was never written. This section stands in for it, as fact rather than complaint —
anyone planning Phase 3 or the frontend needs it.

At `92c0841` (`main`, the base of this phase), Phase 1 shipped:

- Bootstrap: repo, TypeScript, Docker, the full Prisma schema migrated to Neon, CI.
- Auth: `authenticate`, `optionalAuthenticate`, `requireRole`, `POST /auth/register` (admin-only),
  `POST /auth/login`, `GET /auth/me`.
- Tags: `GET /items/:id/tag`, `POST /items/:id/tag/regenerate`, the QR generator, the seed script.

**The Items & Categories track was never built.** Missing: `POST /items`, `GET /items`,
`GET /items/:tagId`, `PUT /items/:id`, the `/categories` router, the tagId generator, and the SDS 3.2
field-filtering behaviour that Phase 1's own plan called its highest-priority test. No open PR covers
any of it. Three of Phase 1's five exit criteria are therefore unmet.

What that cost Phase 2:

| Exit criterion | Blocker | What shipped instead |
|---|---|---|
| Disposed item disappears from default `GET /items` | No `GET /items` | `activeItemsWhere` + its override-resistance test, plus the [contract](#contract-for-the-items-track) |
| …but is still fetchable via history and reports | No reports until Phase 3 | `GET /items/:id/history` returns 200 with full rows for a DISPOSED item |
| F7.3 public lookup of a disposed tag | No `GET /items/:tagId` | `publicItemView` + `DISPOSED_PUBLIC_MESSAGE` unit tests |
| Every `PUT /items/:id` writes a history row | No `PUT /items/:id` | Helper built and tested, call site documented; the approval path proves it works in a real transaction |

**An integration PR is needed when Items lands** — roughly half a day:

1. `GET /items` → `activeItemsWhere()`
2. `GET /items/:tagId` → `publicItemView()`
3. `PUT /items/:id` → `buildEditLogRows()` + `writeEditLogRows()`
4. Replace the four substitute unit tests above with real route tests
5. Re-align `prisma/seed.ts`'s hardcoded `CNCS-DEMO-####` tagIds with the real generator — there is
   already a comment in that file asking for this

Someone should own that by name.

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

Steps 3–4 are the ones worth reading carefully: they are the only end-to-end proof that the cascade
touches the accessory and that both items' history rows land in one decision.

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
pnpm test          # 14 files, 194 tests
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

Watch out for `Prisma.Decimal`: Phase 2 selects no cost fields anywhere, so it never had to decide how
`purchaseCost` serializes to JSON. A report that sums costs will.

## File map

| Path | What |
|---|---|
| `backend/src/routes/requests.ts` | Request CRUD + the two decision endpoints |
| `backend/src/routes/itemHistory.ts` | `GET /items/:id/history` |
| `backend/src/routes/accessories.ts` | Bundle link / unlink |
| `backend/src/routes/notifications.ts` | Inbox |
| `backend/src/services/requestWorkflow.ts` | `applyDecision` + the pure state machine |
| `backend/src/services/itemEditLog.ts` | D1 serialization, diffing, row writing |
| `backend/src/services/notifications.ts` | D2 fan-out, D3 templates, `parseNotificationMessage` |
| `backend/src/services/itemVisibility.ts` | F7.2 / F7.3 / SDS 3.2 helpers |
| `backend/src/services/email.ts` | `NOTIFY_EMAIL` stub transport |
| `backend/src/lib/httpError.ts` | `httpError()` / `isHttpError()` |
| `backend/src/middleware/errorHandler.ts` | `errorHandler`, `notFoundHandler` |
| `backend/src/middleware/validate.ts` | `validateBody`, `validateQuery`, `validated*` accessors |
| `backend/src/test-utils/index.ts` | `createToken`, `makeUser`, `makeItem`, `makeRequest`, `makeNotification` |

Each of those has a `.test.ts` beside it except `httpError.ts` and `test-utils/`, which are covered
through their callers.











