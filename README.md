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
- **Frontend (planned):** React + Vite + Tailwind CSS

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
pnpm install
docker compose up --build
```

The backend will be available at `http://localhost:4000`. Check `/health` to confirm it's running.

### Running tests

```bash
pnpm test
```

### Database

Schema lives in `backend/prisma/schema.prisma`. Migrations run against Neon via `DIRECT_URL`. If you change the schema, coordinate with the team first — everyone builds on top of the same models.

Phase 2 changed no models, so pulling it needs no migration and no `prisma:generate`.

## Branching & workflow

- `main` is protected — no direct pushes, all changes go through a PR with review.
- Branch naming: `<track>/<short-description>` (e.g. `auth/login-route`, `items/pagination`).
- Write tests alongside the code you're writing, not after — CI runs them on every push.
- Don't touch `schema.prisma` outside your own track without a heads-up to the team.

## Project Status

### Phase 1 — Foundation (in progress)

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



**Items & Categories track — not started.** No `POST /items`, `GET /items`,
`GET /items/:tagId`, `PUT /items/:id`, no `/categories` router, no tagId generator, and no
SDS 3.2 public field filtering. Phase 2 built around this; see
[`docs/phase-2.md`](docs/phase-2.md) → "Inherited gaps from Phase 1" and "Contract for the
Items track" for what is waiting to be wired up.

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
reviewer role unresolved in §9 and ADMIN-only needs no migration), real SMTP (`NOTIFY_EMAIL`
gates a stub transport), and anything under `/items` with a single path segment — that
namespace belongs to the Items track.

**Schema:** unchanged. Phase 2 added no columns, no indexes and no migration.

---

_This README is meant to grow with the project. When you finish your track (or make meaningful progress on it), please update your section above with what's done, and add anything a teammate would need to know to build on top of it — new env vars, new endpoints, gotchas you hit. Treat this as the single source of truth for "what actually exists right now," not just what was planned._
