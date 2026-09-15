# Backend handoff

This is the backend the frontend is building against. Every route below is also available under `/api/v1`; use that versioned prefix for new frontend work. There is no generated Swagger/OpenAPI contract—the phase documents and this handoff are the current API reference.

## What's built

| Endpoint | Access | What it does |
| --- | --- | --- |
| `GET /health` | Public | Returns `{ "status": "ok" }`. |
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Admin / Public / signed in | Account creation, one-day JWT login, and current-account lookup. |
| `GET /categories`, `POST /categories` | Public / Admin | List and create categories. |
| `POST /items` | Staff, Admin | Registers an item and creates its tag ID and QR image. |
| `GET /items` | Public; richer when signed in | Paginated active-item list: `page`, `limit`, `search`, `categoryId`, `department`. |
| `GET /items/:tagId`, `PUT /items/:id` | Public; Staff/Admin | Public QR lookup and active-item update with per-field history. Public disposed lookup is 410. |
| `GET /items/:id/tag`, `POST /items/:id/tag/regenerate` | Staff, Admin | Fetch or re-render a QR PNG; regeneration retains the tag ID. |
| `GET /items/:id/history` | Staff, Admin | Edit history, including disposed items; `field`, `limit`, `offset`. |
| `POST /items/:id/accessories`, `DELETE /items/:id/accessories/:accessoryId` | Staff, Admin | Link/unlink existing accessory items; bundle rules are server-enforced. |
| `POST /requests`, `GET /requests`, `GET /requests/:id`, `GET /requests/pending-count` | Staff, Admin | Transfer/disposal workflow and scoped review queue. List supports `status`, `type`, `mine`, `limit`, `offset`. |
| `POST /requests/:id/approve`, `POST /requests/:id/reject` | Admin | Decide a pending request; requester self-decision is blocked server-side. |
| `GET /notifications`, `POST /notifications/:id/read` | Signed in | Caller’s own inbox/read state; list supports `unread`, `limit`, `offset`. |
| `POST /audits`, `POST /audits/:id/scan` | Staff, Admin | Start an audit and record scans as `FOUND`; clients cannot supply a result. |
| `POST /audits/:id/complete` | Staff, Admin | Completes a `DEPARTMENT` audit, classifies results, and updates `lastAuditedAt` only for `FOUND` items. |
| `GET /reports/inventory?format=csv` | Staff, Admin | Active and disposed inventory CSV; filters: `department`, `categoryId`, `status`, `dateFrom`, `dateTo`. |
| `GET /reports/audit/:auditId?format=csv` | Staff, Admin | CSV for one audit, including an in-progress audit. |
| `GET /reports/disposals?format=csv` | Staff, Admin | Approved-disposal CSV; filters: `department`, `dateFrom`, `dateTo`. |

Report dates use UTC and `dateTo` includes the whole UTC day. CSV decimals are strings.

## Field filtering is a backend rule

SDS 3.2 / SRS 3.4 is enforced server-side by `backend/src/utils/filterItemFields.ts` (`sanitizeItem`). A public or non-owner viewer must never receive `purchaseCost`, `currentValue`, `brand`, `model`, `serialNumber`, `notes`, owner/`ownerId` details, or `accessories`, including through direct URL manipulation.

The frontend must never rely on UI hiding alone or duplicate this rule. The API omits these fields for an unprivileged viewer; render only what it sends.

## Stretch and intentionally absent work

- PDF reports are not built; CSV is the only supported format.
- `LOCATION` audit completion is not built. Only `scopeType: "DEPARTMENT"` completes; other scope types return 400.
- `GET /audits` audit-history listing is not built.
- In-app notifications are built. Real email is not: `NOTIFY_EMAIL` gates a stub that only logs; it has no SMTP transport.
- Swagger/OpenAPI is not built.

## Known rough edges

- No test database exists. Route tests mock Prisma, so database transactions and query clauses are not automated end-to-end.
- Completion deduplicates scans for classification, but audit CSV exports every persisted scan row. A double scan produces duplicate rows.
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
