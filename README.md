# CNCS Property Management System

A standalone property/asset management system built as an internship deliverable for AAU CNCS. Tracks non-consumable campus assets (location, category, condition, ownership) with QR-tag identification, transfer/disposal approval workflows, and audit reconciliation. Built as a companion system alongside the existing MOFED system (not a replacement or integration).

## Tech Stack

- **Backend:** Node.js 22 + Express + TypeScript (strict mode)
- **Database:** PostgreSQL, hosted on Neon
- **ORM:** Prisma 7 (`prisma.config.ts` pattern, Neon driver adapter)
- **Auth:** JWT + argon2id password hashing
- **Package manager:** pnpm
- **Containerization:** Docker (from commit one)
- **CI/CD:** GitHub Actions — lint, build, test, docker build on every push
- **Frontend:** React 19 + Vite + TypeScript (strict) + Tailwind CSS 4 — Phase 1 shipped, see [`docs/frontend-phase-1.md`](docs/frontend-phase-1.md)

## Getting Started

### Prerequisites

- Node.js 22
- pnpm (via corepack)
- Docker Desktop
- A `.env` file at the repo root (ask a team member for values, or copy `.env.example` and fill in your own Neon credentials)

### Environment variables

```bash
DATABASE_URL=          # pooled connection, used at runtime
DIRECT_URL=            # unpooled connection, used for migrations
JWT_SECRET=
PORT=4000

NOTIFY_EMAIL=false                        # email side-channel for notifications (SRS F8.3); transport is a stub
UPLOADS_DIR=./uploads                     # where QR tag PNGs are written
PUBLIC_BASE_URL=http://localhost:5173     # base URL encoded inside each QR code
```

The last three are optional — the code falls back to exactly these values. Copy
`.env.example` and fill in the first three.

### Run locally

```bash
git clone <repo-url>
cd <repo-name>
docker compose up --build
```

The backend will be available at `http://localhost:4000`, the frontend at
`http://localhost:5173`. Check `/health` to confirm the backend is running.

### Running the frontend

The frontend runs as the `frontend` service of the same `docker compose up` —
no second command, no extra steps beyond the root `.env`. To work on it without
Docker:

```bash
cd frontend
pnpm install
pnpm dev          # http://localhost:5173
```

Frontend environment variables live in `frontend/.env.example`:

```bash
VITE_API_BASE_URL=http://localhost:4000   # baked into the browser bundle at dev/build time
```

The client appends the `/api/v1` prefix itself — set the base URL **without** it.

> **`PUBLIC_BASE_URL` must point at the frontend origin.** The backend encodes
> `${PUBLIC_BASE_URL}/item/:tagId` inside every printed QR sticker (default
> `http://localhost:5173`). If the frontend's host ever changes, change
> `PUBLIC_BASE_URL` with it or every existing sticker scans to a dead page —
> and nothing in CI catches that, because both sides are behaving correctly.

Frontend checks (CI runs all of these on every PR):

```bash
cd frontend
pnpm run lint     # eslint (TS, react-hooks, jsx-a11y)
pnpm run build    # tsc -b + vite build — type-checks test files too
pnpm test         # vitest + React Testing Library + MSW
```

Seed credentials for the staff/admin screens: `admin@cncs.aau.edu.et` /
`Admin123!` and `staff@cncs.aau.edu.et` / `Staff123!`.

What ships in each frontend phase, and the full screen-by-screen contract, is
in [`docs/Frontend_Three_Phase_Plan.md`](docs/Frontend_Three_Phase_Plan.md),
[`docs/frontend-plan.md`](docs/frontend-plan.md), and
[`docs/frontend-design-system.md`](docs/frontend-design-system.md). Phase 1's
write-up — where the API client, auth shell, field-visibility rule, and the
QR/`PUBLIC_BASE_URL` dependency live — is
[`docs/frontend-phase-1.md`](docs/frontend-phase-1.md).

### Running tests

```bash
cd backend
pnpm install
pnpm exec prisma generate
pnpm run lint
pnpm run build
pnpm test
```

### Database

Schema lives in `backend/prisma/schema.prisma`. Migrations run against Neon via `DIRECT_URL`. If you change the schema, coordinate with the team first — everyone builds on top of the same models.

Phase 2 changed no models, so pulling it needs no migration and no `prisma:generate`.

## Branching & workflow

Full rules in [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version:

- `main` is protected: no direct pushes, and a PR needs one approving review before GitHub will let
  it merge.
- Branch naming: `<track>/<short-description>` (e.g. `auth/login-route`, `items/pagination`).
- Write tests alongside the code you're writing, not after — CI runs them on every push.
- Don't touch `schema.prisma` outside your own track without a heads-up to the team, and say in the
  PR whether the migration was applied to Neon — CI cannot detect an unapplied one.

## Project Status

Per-phase write-ups: [`docs/phase-1.md`](docs/phase-1.md),
[`docs/phase-2.md`](docs/phase-2.md), and [`docs/phase-3.md`](docs/phase-3.md).
Frontend developers should start with the consolidated
[`docs/backend-handoff.md`](docs/backend-handoff.md).

### Phase 1 — Foundation (complete)

**Bootstrap (complete):**

- Repo structure, TypeScript + pnpm setup
- Docker (backend service, Neon-based — no local Postgres container)
- Full Prisma schema migrated to Neon
- GitHub Actions CI (lint/build/test/docker build) — green
- `authenticate` / `requireRole` middleware, with unit tests

**Auth & Access Control track (Lalu):**

- [x] Auth middleware contract (`authenticate`, `requireRole`)
- [x] `optionalAuthenticate` middleware (for public browse/search routes)
- [x] Register route (Admin-only account creation)
- [x] Login route (argon2id verify + JWT issue)
- [x] `/auth/me` route



**Items & Categories track (Yanet):**

- [x] `POST /items` (Staff/Admin) with generated `CNCS-XXXXXXXX` tag IDs
- [x] `GET /items` — pagination, `?search=`, `?categoryId=`, `?department=`
- [x] `GET /items/:tagId` — public tag lookup
- [x] `PUT /items/:id` — writes one `ItemEditLog` row per changed field
- [x] `/categories` router — `GET /` (public), `POST /` (Admin)
- [x] SDS 3.2 server-side field filtering (`utils/filterItemFields.ts`)

**Tags, Seed Data & CI polish track:**

- [x] QR tag generator (`utils/qrGenerator.ts`) with unit tests
- [x] `GET /items/:id/tag` and `POST /items/:id/tag/regenerate`
- [x] Seed script (`prisma/seed.ts`) — categories, 2 users, demo items with QR tags
- [x] GitHub Actions CI (lint / build / test / docker build)

### Phase 2 — Workflows & Notifications (complete)

Transfer and disposal approvals, item edit history, accessory bundles, and in-app
notifications. Full write-up, decision register and manual walkthrough in
[`docs/phase-2.md`](docs/phase-2.md).

Every route is mounted twice — under `/api/v1` (the SDS path) and under its bare path, so
Phase 1's paths keep working.

**Requests & approvals track (Hayredin):**

- [x] `POST /requests` — file a TRANSFER or DISPOSAL (Staff/Admin)
- [x] `GET /requests`, `GET /requests/:id` — scoped: staff see their own, admin sees all
- [x] `GET /requests/pending-count` — review-queue badge
- [x] `POST /requests/:id/approve`, `POST /requests/:id/reject` — Admin only, one transaction
- [x] `GET /items/:id/history` — edit trail, Staff/Admin, disposed items included
- [x] Central error handler + `validate()` middleware + `HttpError`
- [x] Approval services: `requestWorkflow`, `itemEditLog`, `notifications`, `itemVisibility`, `email`

**Notifications & bundles track (John):**

- [x] `GET /notifications` — own inbox only, `?unread=`, unread badge count
- [x] `POST /notifications/:id/read` — scoped by `userId` (IDOR-safe)
- [x] `POST /items/:id/accessories`, `DELETE /items/:id/accessories/:accessoryId`
- [x] Cascade of an approved transfer/disposal onto a bundle's accessories

**Deliberately not built:** a `canReview` flag (approval is ADMIN-only — the SRS leaves the
reviewer role unresolved in §9 and ADMIN-only needs no migration), and real SMTP (`NOTIFY_EMAIL`
gates a stub transport).

**Schema:** unchanged. Phase 2 added no columns, no indexes and no migration.

**Integration with Phase 1 (Items & Categories):** Phase 2 was written before that track
landed, so merging the two needed a pass over three files. What changed and why is in
[`docs/phase-2.md`](docs/phase-2.md) → "Integration with the Items track"; the short version:

- `GET /items` filters through `activeItemsWhere()`, so a disposed item leaves the default
  listing (SRS F7.2) and no query string can put it back.
- `GET /items/:tagId` answers a disposed tag with `410 { "error": "This item is no longer in
  service" }` for the public (F7.3) and the full record for Staff/Admin (F7.2).
- `PUT /items/:id` writes its history through `buildEditLogRows` + `writeEditLogRows`, the same
  helpers the approval path uses, so one edit and one approval produce identical rows.
- `parentItemId` is rejected by `POST`/`PUT /items` — `POST /items/:id/accessories` is the only
  writer, because that is where the bundle rules live.
- Field filtering is `utils/filterItemFields.ts` (`sanitizeItem`), Phase 1's implementation.
  Phase 2's duplicate `publicItemView` was deleted rather than reconciled.

### Phase 3 — Audit, reconciliation & reporting (complete)

Audit sessions and CSV reporting are complete. The full decision record, report formats,
and known gaps are in [`docs/phase-3.md`](docs/phase-3.md).

- [x] `POST /audits` — start an audit session (Staff/Admin)
- [x] `POST /audits/:id/scan` — record a physical scan as `FOUND` (Staff/Admin)
- [x] `POST /audits/:id/complete` — calculate `FOUND`, `MISSING`, and
  `LOCATION_MISMATCH`, then update `lastAuditedAt` only for found items
- [x] `GET /reports/inventory?format=csv` — active and disposed inventory export
- [x] `GET /reports/audit/:auditId?format=csv` — audit result export
- [x] `GET /reports/disposals?format=csv` — approved-disposal export

Reports are Staff/Admin-only and CSV-only. Inventory exports include disposed rows as
required by F7.2; disposal exports read approved `Request` history rather than current
item status. Date-range upper bounds include the entire UTC `dateTo` day.

**Current intentional limits:** PDF export, real SMTP email delivery, `LOCATION` audit
completion, audit-history listing, and Swagger/OpenAPI are not built. The backend handoff
also records the remaining audit-report duplicate-scan behavior and the lack of a real test
database.

### API and frontend handoff

Every API router is available at both its bare path and `/api/v1` (for example,
`/auth/login` and `/api/v1/auth/login`). Use `/api/v1` for new frontend work. There is no
generated OpenAPI/Swagger contract; use [`docs/backend-handoff.md`](docs/backend-handoff.md)
for the complete endpoint inventory, access rules, seed credentials, field-filtering rule,
and known rough edges.

---

_This README is meant to grow with the project. When you finish your track (or make meaningful progress on it), please update your section above with what's done, and add anything a teammate would need to know to build on top of it — new env vars, new endpoints, gotchas you hit. Treat this as the single source of truth for "what actually exists right now," not just what was planned._
