# Phase 3 — Audit, Reconciliation & Reporting

Covers SRS F9 (scan-assisted audits) and F10 (reports). Backend only. Built in three
sequential steps by three people; this file is written after all three merged, in the
same spirit as `docs/phase-1.md` and `docs/phase-2.md` — it describes what actually
shipped, not the original plan, and every deviation is recorded rather than smoothed
over.

> An earlier draft of this file described Phase 3 as two steps (audit creation/scan
> and completion) and did not yet include the reports work, since it was written before
> Step 3 was finished. This version reflects all three steps as actually shipped.

## What shipped

| Endpoint                      | Step | Owner  | Notes                                                                                                            |
| ----------------------------- | ---- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `POST /audits`                | 1    | Ammar  | Starts a session with a scope (`scopeType`/`scopeValue`)                                                         |
| `POST /audits/:id/scan`       | 1    | Ammar  | Records an item as physically scanned. Always persists `FOUND` — see [The audit lifecycle](#the-audit-lifecycle) |
| `POST /audits/:id/complete`   | 2    | Latera | Computes `MISSING` / `LOCATION_MISMATCH`, closes the session, updates `lastAuditedAt`                            |
| `GET /reports/inventory`      | 3    | Naomi  | CSV/PDF, all items (ACTIVE + DISPOSED)                                                                           |
| `GET /reports/audit/:auditId` | 3    | Naomi  | CSV/PDF, one row per item (duplicate scans collapsed)                                                            |
| `GET /reports/disposals`      | 3    | Naomi  | CSV/PDF, one row per approved disposal `Request`                                                                 |

No schema changes across any of the three steps. `AuditSession` and `AuditItemResultRow`
were migrated in Phase 1 and sat unused until this phase.

## Implementation status

| Step | Description                                                | Status                                   |
| ---- | ---------------------------------------------------------- | ---------------------------------------- |
| 1    | Create audit sessions and record scans                     | ✅ Implemented, merged to `main`         |
| 2    | Complete audits, calculate `MISSING` / `LOCATION_MISMATCH` | ✅ Implemented, merged to `main`         |
| 3    | Inventory / audit / disposal CSV reports                   | ✅ Implemented, merged to `main`         |

## End-to-end workflow

```
1. Authorized user creates an audit
        |
        v
2. Server creates an incomplete audit session
        |
        v
3. User scans inventory items (repeatable)
        |
        v
4. Server records each scan as FOUND — never a client-supplied result
        |
        v
5. User completes the audit
        |
        v
6. Server compares expected (in-scope) items with scanned items
        |
        v
7. Server calculates FOUND, MISSING, or LOCATION_MISMATCH
        |
        v
8. Server persists results, sets lastAuditedAt (FOUND only), marks the
   audit completed
        |
        v
9. Reports export the audit, inventory, and disposal history as CSV or PDF
```

## Step 1 — Create audits and record scans

**Owner:** Ammar.

### `POST /audits`

Creates a new audit session.

```json
{
  "scopeType": "DEPARTMENT",
  "scopeValue": "Engineering"
}
```

| Field        | Type           | Required | Description                                                                                       |
| ------------ | -------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `scopeType`  | string         | Yes      | Defines the audit scope. Trimmed, non-empty. No schema enum — see [D8](#d8--scopetype-semantics). |
| `scopeValue` | string or null | No       | The scope's target — e.g. a department name.                                                      |

The authenticated user is recorded as the one who ran the audit (`runById`). The session
starts incomplete (`completedAt: null`).

### `POST /audits/:id/scan`

Records that an item was physically found during the walkthrough.

```json
{
  "itemId": "valid-item-uuid",
  "scannedAt": "2026-09-15T06:00:00.000Z"
}
```

| Field       | Type | Required | Description                                     |
| ----------- | ---- | -------- | ----------------------------------------------- |
| `itemId`    | UUID | Yes      | The item being scanned.                         |
| `scannedAt` | date | No       | Defaults to the current server time if omitted. |

**Rules, all enforced server-side:**

- The client must not, and cannot, submit a result — `result` is not accepted in the
  request body at all.
- Every valid scan is persisted as `FOUND`.
- The audit session must exist (404) and must not already be completed (409).
- The referenced item must exist (404).
- `lastAuditedAt` is **not** touched here — see [why](#the-audit-lifecycle).
- This endpoint never calculates `MISSING` or `LOCATION_MISMATCH` — that happens only at
  completion.

**Why the client doesn't submit a result:** the scanner is only confirming that an item
was physically found. Trusting a client-supplied classification would let the client
decide the audit's outcome before the audit is even complete — this was corrected during
review of the original Step 1 submission, which initially accepted a client-supplied
`result` enum.

## Step 2 — Complete an audit and calculate results

**Owner:** Latera.

### `POST /audits/:id/complete`

Finalizes an audit session and calculates the result for every relevant item.

**Responsibilities:**

1. Validate the audit session ID; confirm the session exists (404) and is not already
   completed (409).
2. Resolve which items are in scope (currently `scopeType === "DEPARTMENT"` only — see
   [D8](#d8--scopetype-semantics)).
3. Resolve which items were scanned during the session (deduplicated by item — see
   [D11](#d11--duplicate-scan-handling)).
4. Classify every relevant item (see table below).
5. Persist the results, update `lastAuditedAt` (`FOUND` items only — see
   [D9](#d9--lastauditedat-scope)), and close the session — all inside a single
   transaction, so a failure partway through leaves nothing partially applied.
6. Return a summary usable directly by the frontend.

**Classification math** — pure, dependency-free, unit tested independently of Prisma
(`services/auditCompletion.ts`):

| Result              | Meaning                                |
| ------------------- | -------------------------------------- |
| `FOUND`             | In scope and scanned.                  |
| `MISSING`           | In scope, not scanned.                 |
| `LOCATION_MISMATCH` | Scanned, but not in the audit's scope. |

**Completion rules:**

- A completed audit cannot be completed again (409, checked before any scope resolution
  or item query).
- Completion is atomic — one `$transaction`, so a mid-operation failure never leaves
  partial results persisted.
- The session close uses a compare-and-swap
  (`updateMany({ where: { id, completedAt: null } })`), mirroring Phase 2's
  request-decision race guard, rather than a bare `update` — protects against two
  concurrent completions of the same session.
- The completion timestamp is stored and reused as `lastAuditedAt` for every `FOUND`
  item, so all rows from one completion share an exact timestamp (same correlation
  pattern Phase 2 uses for `ItemEditLog`).

## Step 3 — Reports

**Owner:** Naomi.All three reports are Staff/Admin only and come as CSV or PDF (`?format=csv` default,
`?format=pdf` now built, anything else is 400, not a silent JSON fallback). Both formats
are hand-rolled rather than pulling a dependency — RFC 4180 CSV (`utils/csv.ts`) and a
minimal monospaced PDF table (`utils/pdf.ts`) — and both render the same headers and rows.

- **`GET /reports/inventory`** — queries through `allItemsWhere()`, not
  `activeItemsWhere()`. Phase 2 left `allItemsWhere()` deliberately uncalled specifically
  so a report could be its first caller (F7.2 requires disposed items stay "queryable in
  reports"). Filterable by `department`, `categoryId`, `status`, `dateFrom`/`dateTo`
  (on `registeredAt`).
- **`GET /reports/audit/:auditId`** — one row per scan/classification, with session
  metadata (scope, runBy, timestamps) denormalized onto every row so the CSV stays one
  flat, spreadsheet-importable table. Works against an in-progress (not yet completed)
  session too.
- **`GET /reports/disposals`** — reads from `Request` (`type: DISPOSAL, status:
APPROVED`), not `Item.status`. Only the request row carries requester, reviewer, and
  reason together, and this was confirmed to matter in manual testing: the seed script
  resets demo items back to `ACTIVE` on every re-seed, which would silently erase
  disposal records from a status-based report. Filterable by `department`,
  `dateFrom`/`dateTo` (on `decidedAt`).
- `Prisma.Decimal` fields (`purchaseCost`, `currentValue`) are explicitly `.toString()`'d
  before being written to CSV — closes a gap flagged as open since Phase 1
  (`JSON.stringify` otherwise renders a Decimal as an unformatted string).
- `dateTo` is inclusive of the whole day, computed in UTC
  (`setUTCHours(23,59,59,999)`) rather than local time, to avoid the cutoff drifting by
  the server's timezone.
- SDS 3.2's field-filtering rule (`sanitizeItem`) does not apply here — that rule governs
  what a _viewer_ of an item may see, and every viewer of a report is already Staff or
  Admin by the route guard.

## Security and validation requirements (all three steps)

- All audit and report endpoints require authentication.
- Audit creation, scanning, completion, and reports are restricted to `ADMIN`/`STAFF`.
- Audit IDs and item IDs are validated as UUIDs where applicable.
- `scopeType` must be a trimmed, non-empty string.
- Client-provided `result` values are never accepted at scan time.
- A completed audit session is immutable with respect to additional scans.
- Final audit classifications are always calculated server-side, never trusted from
  client input.

## API summary

| Method | Endpoint                  | Purpose                                        |
| ------ | ------------------------- | ---------------------------------------------- |
| POST   | `/audits`                 | Create an audit session                        |
| POST   | `/audits/:id/scan`        | Record a physical scan as FOUND                |
| POST   | `/audits/:id/complete`    | Calculate final results and complete the audit |
| GET    | `/reports/inventory`      | Export all items as CSV or PDF                 |
| GET    | `/reports/audit/:auditId` | Export one audit session's results as CSV/PDF  |
| GET    | `/reports/disposals`      | Export approved disposals as CSV or PDF        |

## Decision register (Phase 3)

Continuing Phase 2's D1–D7 numbering.

| #   | Question                                                                             | Decision                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D8  | What does `scopeType` mean, and which values are supported?                          | Only `"DEPARTMENT"` (matches `Item.department`) is implemented. `scopeType` has no schema enum — it's a plain `String` — so this is an application-level decision, not a database constraint. Any other value, including `"LOCATION"`, returns 400 rather than a guessed parsing of `scopeValue`. **Still open:** what `LOCATION`'s `scopeValue` format should be.                                                   |
| D9  | Does `lastAuditedAt` update for every in-scope item, or only confirmed-present ones? | Only `FOUND` items. A `MISSING` item was never verified present, so it doesn't get a fresh audit timestamp.                                                                                                                                                                                                                                                                                                          |
| D10 | How is an out-of-scope scan classified?                                              | `LOCATION_MISMATCH`, computed at completion — not rejected at scan time, not silently dropped.                                                                                                                                                                                                                                                                                                                       |
| D11 | How are duplicate scans of the same item handled?                                    | Classification math collapses them via `Set` — one logical result per item per audit — and the **readers collapse them too** (`collapseAuditRows`, keeping the latest `scannedAt`), so `GET /audits`, `GET /audits/:id`, the CSV and the PDF each report one item once and the FOUND count is items, not scans. **Not enforced at the persistence layer**: `AuditItemResultRow` has no unique constraint on `(auditSessionId, itemId)`, so the raw table stays scan-level. |
| D12 | Which `Item` source does the disposals report read from?                             | `Request` history, not `Item.status` — confirmed necessary because the seed script resets demo items to `ACTIVE`, which would silently erase disposal records from a status-based report on every re-seed.                                                                                                                                                                                                           |

## Known gaps at the end of Phase 3

1. **~~Duplicate-scan rows are not deduplicated in the audit report~~** (D11).
   **Closed** by read-side collapsing (`collapseAuditRows`, latest `scannedAt`), applied
   to `GET /audits`, `GET /audits/:id` and the export. The remaining choice is whether
   to also add a unique constraint on `(auditSessionId, itemId)`, which needs a
   migration and so was left out.
2. **`LOCATION` scope type is unimplemented** (D8). Needs a product decision on
   `scopeValue`'s format before it can be built.
3. **`auditId` route param is used unsanitized in a response header**
   (`Content-Disposition` on the audit report). Low risk — only reachable after a
   successful session lookup — but not yet hardened with `encodeURIComponent` or upfront
   UUID validation the way `audits.ts` validates `itemId`.4. **PDF export is built** (was marked stretch/cut-first). A hand-rolled,
   dependency-free table writer (`utils/pdf.ts`) sits beside the CSV serializer and
   shares its headers and rows, so `?format=csv` and `?format=pdf` cannot diverge.
5. **Inherited from Phase 1: still no test database.** Every route test in this phase
   mocks Prisma. Manual verification against seeded Neon data (done for Step 3) is the
   only place these reports have met a real database.
6. **The original Step 1 submission required correction before merge** — it initially
   accepted a client-supplied `result` at scan time and updated `lastAuditedAt` on every
   scan rather than at completion. Both were caught in review and corrected before merge;
   noted here so the history isn't lost, not because either issue is still open.

## Verification

From `backend/`:

```bash
pnpm install
pnpm exec prisma generate
pnpm run lint
pnpm run build      # type-checks .test.ts files too
pnpm test           # all three phases combined
```

```bash
docker compose up --build     # repo root; confirm the full, three-phase backend boots
curl localhost:4000/health    # {"status":"ok"}
```

## File map

| Path                                      | What                                                                 | Step    |
| ----------------------------------------- | -------------------------------------------------------------------- | ------- |
| `backend/src/routes/audits.ts`            | `POST /audits`, `POST /audits/:id/scan`, `POST /audits/:id/complete` | 1, 2    |
| `backend/src/services/auditCompletion.ts` | Pure classification math                                             | 2       |
| `backend/src/routes/reports.ts`           | All three report endpoints                                           | 3       |
| `backend/src/utils/csv.ts`                | RFC 4180 CSV serializer                                              | 3       |
| `backend/src/app.ts`                      | Router mounts (all three steps)                                      | 1, 2, 3 |

Each file above has a `.test.ts` beside it.

## Where to go next

`docs/backend-handoff.md` — what's built, what's stretch/not built, the known gaps
above restated for whoever picks them up, and the field-filtering rule restated once
more for the frontend team.
