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

DATABASE_URL= # pooled connection, used at runtime
DIRECT_URL= # unpooled connection, used for migrations
JWT_SECRET=
PORT=4000

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
- [ ] `optionalAuthenticate` middleware (for public browse/search routes)
- [x] Register route (Admin-only account creation)
- [ ] Login route (argon2id verify + JWT issue)
- [ ] `/auth/me` route


**Items & Categories track — not started**

**Tags, Seed Data & CI polish track — not started**

---

_This README is meant to grow with the project. When you finish your track (or make meaningful progress on it), please update your section above with what's done, and add anything a teammate would need to know to build on top of it — new env vars, new endpoints, gotchas you hit. Treat this as the single source of truth for "what actually exists right now," not just what was planned._
