# Backend handoff

This is the backend the frontend is building against. Every route below is also available under `/api/v1`; use that versioned prefix for new frontend work. There is no generated Swagger/OpenAPI contract—the phase documents and this handoff are the current API reference.

## What's built

| Endpoint | Access | What it does |
| --- | --- | --- |
| `GET /health` | Public | Returns `{ "status": "ok" }`. |
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Admin / Public / signed in | Account creation, one-day JWT login, and current-account lookup. The address is matched **without regard to case** and stored lowercased; a staff `id` like `STAFF-007` is matched exactly. See "Email is one address" below. |
| `GET /categories`, `POST /categories` | Public / Admin | List and create categories. |
| `POST /items` | Staff, Admin | Registers an item and creates its tag ID and QR image. |
| `GET /items` | Public; richer when signed in | Paginated active-item list: `page`, `limit`, `search`, `categoryId`, `department`. |
| `GET /items/:tagId`, `PUT /items/:id` | Public; Staff/Admin | Public QR lookup and active-item update with per-field history. Public disposed lookup is 410. `PUT` refuses `building`, `floor`, `room` and `ownerId` — those four are transfer-only, whatever the caller's role. |
| `DELETE /items/:id` | **Admin** | Permanently removes the item *and* its requests, edit history and audit results; accessories are unlinked, not deleted. See the deviation below. |
| `POST /uploads/photo` | Staff, Admin | Stores an image (`multipart/form-data`, field `photo`, ≤5 MB, JPEG/PNG/WebP/GIF) and returns `{ url }`. |
| `GET /items/:id/tag`, `POST /items/:id/tag/regenerate` | Staff, Admin | Fetch or re-render a QR PNG; regeneration retains the tag ID. |
| `GET /items/:id/history` | Staff, Admin | Edit history, including disposed items; `field`, `limit`, `offset`. |
| `POST /items/:id/accessories`, `DELETE /items/:id/accessories/:accessoryId` | Staff, Admin | Link/unlink existing accessory items; bundle rules are server-enforced. |
| `POST /requests`, `GET /requests`, `GET /requests/:id`, `GET /requests/pending-count` | Staff, Admin | Transfer/disposal workflow and scoped review queue. List supports `status`, `type`, `mine`, `limit`, `offset`. |
| `POST /requests/:id/approve`, `POST /requests/:id/reject` | Admin | Decide a pending request; requester self-decision is blocked server-side. |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | Signed in | Caller’s own inbox/read state; list supports `unread`, `limit`, `offset`. `read-all` answers `{ updated }` — the rows that actually flipped, so `0` means "nothing was unread" rather than "the call failed". |
| `DELETE /notifications/:id`, `DELETE /notifications` | Signed in | Dismiss one message (`{ id, deleted: true }`) or empty the inbox (`{ deleted }`, idempotent). Hard delete, scoped to the caller: an id that is not theirs answers 404, the same response as one that does not exist. |
| `POST /audits`, `POST /audits/:id/scan` | Staff, Admin | Start an audit and record scans as `FOUND`; clients cannot supply a result. |
| `POST /audits/:id/complete` | Staff, Admin | Completes a `DEPARTMENT` audit, classifies results, and updates `lastAuditedAt` only for `FOUND` items. |
| `GET /audits`, `GET /audits/:id` | Staff, Admin | Audit history and one session read back with its stored result rows. `GET /audits` is scoped like `GET /requests` (a Staff caller sees their own, an Admin sees all) and supports `mine`, `limit`, `offset`; its `counts` are derived from those rows. |
| `GET /reports/inventory?format=csv` | Staff, Admin | Active and disposed inventory CSV; filters: `department`, `categoryId`, `status`, `dateFrom`, `dateTo`. |
| `GET /reports/audit/:auditId?format=csv` | Staff, Admin | CSV for one audit, including an in-progress audit. |
| `GET /reports/disposals?format=csv` | Staff, Admin | Approved-disposal CSV; filters: `department`, `dateFrom`, `dateTo`. |

Report dates use UTC and `dateTo` includes the whole UTC day. CSV decimals are strings.

## Email is one address, whatever its casing

`User.email` is `@unique` on PostgreSQL, where `=` is case-sensitive, so without a rule
`Admin@cncs.aau.edu.et` and `admin@cncs.aau.edu.et` are two rows and two accounts — and only the exact
spelling could sign in. Login now matches the address with `mode: "insensitive"`, `POST /auth/register`
and `PATCH /users/:id` both reject a clash that differs only by case, and an address is stored
lowercased (`utils/email.ts`).

Both halves are load-bearing. Comparing insensitively without normalising on write would still allow
two rows for one address, and `findFirst` would then pick between them arbitrarily; normalising
without the insensitive comparison would strand accounts already stored in mixed case.

`id` is matched exactly throughout. The register route doubles as "register by staff ID", where the
value in the `email` column is an identifier such as `STAFF-007`; `normalizeEmail` only lowercases
values containing `@`, so an identifier is never rewritten, and two ids differing only by case remain
two ids.

## Why a notification may be deleted when nothing else may

The two `DELETE /notifications` routes above are the other place a row is really removed, and they
are not the same kind of exception as the one recorded directly below. A notification is not a
record of the item's life — it is a **copy of an event whose original still exists**: the request,
the `ItemEditLog` row, the audit result. Deleting one loses nothing the register would have kept,
which is exactly why the inbox can behave like an inbox while every other trail stays append-only.

Both routes scope by `userId` in the `where` of a `deleteMany`, never by `delete({ where: { id } })`
— the plain form is an IDOR that would let any signed-in account delete any id it guessed.
`count === 0` answers `404 Notification not found` for "not yours" and "does not exist" alike, so
the response never confirms that an id it may not touch exists.

## Any Staff member may edit any active item — deliberately

`PUT /items/:id` is `requireRole(["ADMIN", "STAFF"])` with no check that the caller owns the item, and
`ItemActions` offers Edit to every signed-in viewer. This is a decision, not an oversight — it was
raised in review ("any staff member seems to be able to edit items even if they weren't the one who
added them"), so the reasoning is recorded rather than rediscovered.

Registration is not custody. Staff register what they find, then move, audit and repair it, and a
correction should not be blocked because the person who typed the row has left the university or is on
leave. The register is also the *shared* fact: the value of a correction is that whoever notices the
mistake can make it.

**What is already restricted** is the part that would make an edit a lie about *where an item is*.
`building`, `floor`, `room` and `ownerId` are refused by `PUT /items/:id` for every role, Admin
included, and only an approved TRANSFER request may change them. So a Staff member may correct the
description of an item they did not register, and may not quietly move it or hand it to themselves.

**If it is ever changed** to "the custodian or an Admin", the places that have to move together are:
this route, `ItemActions`, the QR page's staff section, the audit walkthrough, the transfer cascade
(which reassigns `ownerId`), and the demo seed, where Staff are expected to edit seeded items. It is a
one-line role check with a wide blast radius, which is exactly why it should be a decision rather than
a drive-by change.

## `DELETE /items/:id` is a deliberate departure from F7.2

Everywhere else, a record is never destroyed: disposal flips `status` to `DISPOSED` and keeps the
row, a decided request cannot be reopened, and `ItemEditLog` is append-only. That is the point of
the edit log, and it is why `GET /items` has no "show disposed" toggle — the trail is the product.

`DELETE /items/:id` breaks that rule on purpose, for data correction: a typo'd registration or a
duplicate cannot be fixed by editing, because the tag ID and the original history would remain. So
the capability is fenced in on purpose:

- **Admin only.** Staff get 403; the fleet's path for taking an item out of service stays the
  `DISPOSAL` request, which preserves the trail.
- **Not the UI's default.** Nothing routes here from a disposal flow. The confirmation names what
  goes (history, requests, audit results) and points at the request workflow as the alternative.
- **Dependents are removed in the same transaction**, in dependency order, because every relation
  onto `Item` uses the schema's default `Restrict`. Accessories are *unlinked* — they are separate
  assets, and destroying them would turn one mistake into several. Notifications that referenced the
  deleted requests go too (`Notification.relatedRequestId` is a bare string, not a relation).
- **The photo is not deleted from Cloudinary.** The row's URL is the only reference to it, so the
  asset is orphaned rather than removed.

Responses report the collateral (`unlinkedAccessoryCount`, `deletedRequestCount`,
`deletedEditLogCount`, `deletedAuditResultCount`) so a caller can tell the user what actually went.

## Field filtering is a backend rule

SDS 3.2 / SRS 3.4 is enforced server-side by `backend/src/utils/filterItemFields.ts` (`sanitizeItem`). A public or non-owner viewer must never receive `purchaseCost`, `currentValue`, `brand`, `model`, `serialNumber`, `notes`, owner/`ownerId` details, or `accessories`, including through direct URL manipulation.

The frontend must never rely on UI hiding alone or duplicate this rule. The API omits these fields for an unprivileged viewer; render only what it sends.

## Stretch and intentionally absent work

- PDF reports are not built; CSV is the only supported format.
- `LOCATION` audit completion is not built. Only `scopeType: "DEPARTMENT"` completes; other scope types return 400.
- `GET /audits` returns **sessions and counts only**; the per-item breakdown — tag, name, room and result for every row — is `GET /audits/:id`, which the report page now renders, and the CSV. There is no audit-session delete or reopen, and `POST /audits/:id/complete` is one-way (a second call is a 409).
- **An audit does not snapshot its scope.** Nothing writes a list of "items in scope" when a session starts: `POST /audits/:id/complete` computes FOUND/MISSING/LOCATION_MISMATCH by running the scope filter *at completion* and comparing it with the stored scans. An item registered, moved or disposed during the audit is therefore classified against its state then, not at the start, and an item that was in scope at the start and later deleted leaves no trace of having been in scope at all. Cheap to add (a scope-snapshot table, or an id list on the session) and deliberately deferred — it is the honest limit of what the current numbers mean.
- In-app notifications are built. Real email is not: `NOTIFY_EMAIL` gates a stub that only logs; it has no SMTP transport.
- Swagger/OpenAPI is not built.

## Known rough edges

- No test database exists. Route tests mock Prisma, so database transactions and query clauses are not automated end-to-end.
- Completion deduplicates scans for classification, but audit CSV exports every persisted scan row. A double scan produces duplicate rows.
- The email unique index is case-sensitive, so an account pair created before the case-insensitive rule (or inserted directly) can still differ only by case; login then matches whichever row `findFirst` returns first. The durable fix is a `citext` column or a functional unique index on `lower(email)`, which needs a migration — the rule above prevents new pairs, it cannot repair old ones.
- `auditId` is interpolated directly into the audit download filename; it is neither UUID-validated nor header-sanitized separately.
- Privileged `GET /items` cost fields are `Prisma.Decimal` values serialized as strings; handle them as strings until a deliberate API change.
- Seed tags use `CNCS-DEMO-000n`, while new tags use `CNCS-` plus eight uppercase hex characters. Lookup does not parse the format, so this is deliberate fixture inconsistency.
- The root README has not been updated with Phase 3 endpoints or this final handoff, despite the delivery-plan requirement for a complete Phase 3 run guide.

## Running the backend

1. At the repository root, copy `.env.example` to `.env` and set valid Neon `DATABASE_URL`, `DIRECT_URL`, and `JWT_SECRET` values. `.env` is ignored and is not tracked.
2. Start the stack from the repository root:

   ```bash
   docker compose up --build
   curl http://localhost:4000/health
   ```

3. Seed demo data from `backend/`:

   ```bash
   corepack pnpm prisma:seed
   ```

   It prints the demo credentials: `admin@cncs.aau.edu.et / Admin123!` (ADMIN) and `staff@cncs.aau.edu.et / Staff123!` (STAFF), plus item IDs for request/accessory calls.
4. Login at `POST /api/v1/auth/login` and send `Authorization: Bearer <token>` to protected endpoints:

   ```bash
   curl -X POST http://localhost:4000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"staff@cncs.aau.edu.et","password":"Staff123!"}'
   ```

The compose command, environment template, seed output, and routes above were checked against source. A live boot/health check is unconfirmed here because Docker Desktop is manually paused. Lint, build, and test are also unconfirmed: `pnpm` is absent from PATH and Corepack did not complete in this environment.
