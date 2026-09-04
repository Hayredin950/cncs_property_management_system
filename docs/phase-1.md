# Phase 1 — Foundation

Covers the bootstrap plus SRS F1 (accounts and roles), F2 (item registration and editing),
F3 (QR tags) and F4 (scan and public lookup). Backend only.

This file was written after the fact, from the bootstrap checklist and from the code that actually
merged. **Where the two disagree, this file describes the code** — every deviation is listed under
[Deviations from the bootstrap checklist](#deviations-from-the-bootstrap-checklist) rather than
quietly reconciled, because a plan document that has drifted from the repo is worse than no
document.

## What shipped

### Bootstrap

| Item | State |
|---|---|
| Repo, `/backend`, `/frontend` placeholder, `.gitignore`, `.env.example`, `README.md` | done |
| `docker-compose.yaml` + `backend/Dockerfile` | done — **one service, `backend`** (see deviations); builds, but does not boot until #10 |
| `package.json`, ESLint + Prettier, TypeScript strict | done |
| Full Prisma schema — every SDS model, not just Phase 1's — migrated to Neon | done |
| GitHub Actions: install → `prisma generate` → lint → build → test → docker build | done, green |
| `authenticate` / `requireRole` contract agreed before implementation | done |
| Branch protection on `main` | done — enforced by GitHub, not just agreed |
| `CONTRIBUTING.md` with branch naming and PR rules | filed empty at bootstrap; written in Phase 2 |

The schema was locked first, before any track split off, and that decision held: no phase since has
needed a column. It is the single reason the parallel branches merged as cleanly as they did.

Models: `User`, `Category`, `Item`, `Request`, `ItemEditLog`, `AuditSession`, `AuditItemResultRow`,
`Notification`. Enums: `Role` (`ADMIN | STAFF`), `Condition`, `ItemStatus`, `RequestType`,
`RequestStatus`, `AuditItemResult`. `AuditSession` and `AuditItemResultRow` are unused until Phase 3
and were migrated anyway, on purpose.

### Endpoints

| Endpoint | Who | Notes |
|---|---|---|
| `GET /health` | public | `{ status: "ok" }` |
| `POST /auth/register` | Admin | Account creation is admin-only — there is no public sign-up (F1.1) |
| `POST /auth/login` | public | argon2id verify, then a 1-day JWT |
| `GET /auth/me` | any signed-in user | Never returns `passwordHash` |
| `POST /items` | Staff, Admin | Generates a `CNCS-XXXXXXXX` tag id and its QR PNG |
| `GET /items?page=&limit=&search=&categoryId=&department=` | public, richer when signed in | `limit` defaults to 20, clamps at 100; `page` floors at 1 |
| `GET /items/:tagId` | public, richer when signed in | The scan target (F4.1) |
| `PUT /items/:id` | Staff, Admin | One `ItemEditLog` row per changed field (F2.3) |
| `GET /categories` | public | |
| `POST /categories` | Admin | `name` is `@unique` |
| `GET /items/:id/tag` | Staff, Admin | Returns the QR PNG for an existing tag id |
| `POST /items/:id/tag/regenerate` | Staff, Admin | New **image**, same tag id (F3.5) — the physical sticker is replaced, the record is not |

Every path above is also mounted under `/api/v1` (added in Phase 2 — both spellings reach the same
handler).

## The middleware contract

Agreed as signatures before anything was written, because the Items track could not start without
it. `backend/src/middleware/auth.ts`:

```ts
export type UserRole = "ADMIN" | "STAFF";

export interface AuthenticatedRequest extends ExpressRequest {
  user?: { id: string; role: UserRole };
}

export function authenticate(req, res, next);          // 401 unless a valid Bearer token
export function optionalAuthenticate(req, res, next);  // attaches req.user if present, never rejects
export function requireRole(roles: UserRole[]);        // 401 if unauthenticated, 403 if wrong role
```

The JWT payload is exactly `{ id, role }`, signed with `JWT_SECRET`, `expiresIn: "1d"`.

**Nothing else belongs in that payload.** A token is issued once and lives a day, so anything
carried inside it is a snapshot: if a user's role changed, or a permission flag were added, a token
minted before the change would still assert the old value. Any authorization fact that can change
must be re-read from the database at the point of use. Phase 2's approval path does exactly that.

Four error strings, fixed. Reuse them verbatim rather than writing a near-miss — tests assert on
them and the frontend may branch on them:

| Situation | Code | Body |
|---|---|---|
| No / malformed `Authorization` header | 401 | `{ "error": "Missing or malformed Authorization header" }` |
| Bad or expired token | 401 | `{ "error": "Invalid or expired token" }` |
| `requireRole` with no `req.user` | 401 | `{ "error": "Not authenticated" }` |
| `requireRole` with the wrong role | 403 | `{ "error": "Insufficient permissions" }` |

`optionalAuthenticate` is what makes F4's public routes possible: the same handler serves an
anonymous visitor and a signed-in staff member, and the only difference is how much of the row comes
back.

## Field filtering — where it lives

**Read this before adding any endpoint that returns an item.**
`backend/src/utils/filterItemFields.ts`. One file, one implementation:

```ts
import { sanitizeItem, isPrivilegedViewer } from "../utils/filterItemFields.js";

res.status(200).json(sanitizeItem(item, req.user));
```

The bootstrap checklist asked Phase 1's docs to carry this note by name, and the note not existing
had a direct cost: Phase 2 was written in parallel and shipped a *second* implementation
(`publicItemView`, an allow-list) that disagreed with this one on three fields. Reconciling them was
integration work that a single paragraph would have prevented. See `docs/phase-2.md` →
"C1 — two implementations of SDS 3.2, one kept".

The rule is SRS 3.4's visibility table and SDS 3.2's acceptance criterion: a public viewer never
sees owner name, `purchaseCost`, `currentValue`, `brand`, `model`, `serialNumber`, `notes` or
`accessories` — *"under any circumstance, including via direct URL manipulation (this must be
enforced server-side, not just hidden in the UI)."* `photoUrl`, `condition`, `department`, location
and `tagId` **are** public; do not strip those.

It is a deny-list, which is what SDS 3.2 prescribes — *"strip … from the response object before
sending it"* — and which means **any column added to `Item` later is public until someone adds it to
the set.** That is the one maintenance burden in this file. Whoever adds a column to `Item` also
opens `filterItemFields.ts`.

## Tag ids and QR codes

`backend/src/utils/qrGenerator.ts` — `generateTagQR(tagId)` writes a PNG to `UPLOADS_DIR/tags/` and
encodes `PUBLIC_BASE_URL` + the tag id, so scanning with a phone camera opens the item page with no
app installed (F3.1, F4.1). Built as a standalone module that does not import anything from Items, so
the two tracks could be written in parallel and integrated at the end.

Tag ids are `CNCS-` plus eight uppercase hex characters from `crypto.randomBytes(4)`, and the column
is `@unique`. Four random bytes means the birthday bound catches up sooner than it looks — around
10,000 items there is roughly a 1-in-100 chance that two draws collide — so `POST /items` retries on
a `tagId` P2002 rather than handing the caller a constraint error for a value they never supplied.
(That retry was added during the Phase 2 integration.) Nothing anywhere parses the format: lookup is
an equality match on the column, and the QR payload is a URL built around whatever the id is.

`POST /items/:id/tag/regenerate` deliberately keeps the same tag id and only re-renders the image.
F3.5's reasoning is worth restating because it looks like a bug otherwise: a lost or damaged sticker
is a *printing* problem, and issuing a new id would orphan the old sticker and split the item's
history across two identifiers.

## Deviations from the bootstrap checklist

All four were deliberate. None was written down at the time, which is the actual problem this file
fixes.

| Checklist said | Shipped | Why, and what it cost |
|---|---|---|
| `docker-compose.yml` with **two** services, `backend` + `db` (Postgres) — "nobody should ever need to install Postgres locally" | `docker-compose.yaml`, **one** service; Neon is the database | Neon removed the need for a local Postgres and gave every developer the same data. The cost is that **there is no test database**, so every route test in the repo is mock-based and the integration tests each phase's exit criteria call for do not exist. This is the largest single gap in the project — see [Known gaps](#known-gaps-at-the-end-of-phase-1). |
| bcrypt for password hashing | argon2id (`argon2@0.45.1`) | argon2id won the Password Hashing Competition and is the current OWASP first choice; bcrypt caps the input at 72 bytes. Strictly better, no cost. |
| `routes/auth.js`, `routes/items.js`, `utils/qrGenerator.js` | `.ts` throughout | The project is TypeScript in strict mode. The checklist's `.js` names were shorthand. |
| Prisma "run the first migration" | done, but against **Neon**, and CI only runs `prisma generate` | `prisma generate` reads the schema *file*, not the database. So a schema change that was never migrated still passes lint, build, tests and docker build, and fails at runtime with `column does not exist`. Any PR that touches `schema.prisma` must say in its description whether the migration was applied to Neon. |

## Conventions that will break CI if missed

Every one of these has cost someone a red build.

- **ESM.** `"type": "module"`, `module: nodenext`, `verbatimModuleSyntax`. Every relative import needs
  a `.js` extension even though the file is `.ts`; type-only imports need `import type`.
- **`.test.ts` files are type-checked by `pnpm build`.** `tsconfig.json`'s `include` is
  `src/**/*.ts`, so vitest passing is not the same as CI passing. Cast at mock boundaries with
  `as never` rather than fighting the types.
- **`exactOptionalPropertyTypes`** is on: build Prisma payloads with conditional spread,
  `...(x ? { field: x } : {})`. **`noUncheckedIndexedAccess`** is on: index access is `T | undefined`,
  so `mock.calls[0]?.[0]`.
- **Error bodies are always `{ error: string }`**, plus `details` for a zod failure. Never a bare
  string, never `{ message }`.
- **CI runs `pnpm install --frozen-lockfile`.** A new dependency without a committed
  `pnpm-lock.yaml` fails before any test runs.
- `prisma/seed.ts` is outside `src/`, so it is **neither type-checked nor run in CI.** Run
  `pnpm prisma:seed` by hand after touching it.

## Tracks

Three tracks in parallel after the bootstrap PR merged, split so that each owned distinct files and
the only real dependency ran one way.

| Track | Shipped | Commits authored by |
|---|---|---|
| Bootstrap + Auth & Access Control | The schema, Docker, CI, the middleware contract, `register` / `login` / `/auth/me`, `optionalAuthenticate` | `yanetgeleta` |
| Items & Categories | `POST` / `GET` / `PUT /items`, `GET /items/:tagId`, `/categories`, pagination, validation, `filterItemFields.ts` | `Maedotbbb` |
| Tags, Seed Data & Pipeline | `qrGenerator.ts`, the two tag endpoints, `prisma/seed.ts`, CI polish | `Natnael Girmay` |

> The `README.md` "Project Status" section currently attributes the Auth track to Lalu and the Items
> track to Yanet, which does not match the commit history above. Someone who was there should
> confirm which is right before this file is cited anywhere it matters.

Why the split held: the schema was frozen by the bootstrap PR so nobody touched `schema.prisma`
afterwards; each track owned its own files; and the one blocking dependency — Items needing
`requireRole` — was resolved by shipping the middleware first, within hours, before the rest of auth.
The QR generator was written to depend on nothing, so its integration into item creation was a small,
late, non-blocking step in both directions.

## Exit criteria

| Criterion | State |
|---|---|
| `docker compose up` boots the backend | **not met on `main`** — the container starts, then the app exits with `SyntaxError: The requested module '@prisma/client' does not provide an export named 'PrismaClient'`. Fixed in #10 |
| CI green on `main` | met |
| Auth: admin-only registration, login, `/auth/me`, role middleware | met |
| Item CRUD, categories, pagination, validation | met |
| Server-side field filtering, enforced for anonymous and non-owner viewers | met — `utils/filterItemFields.ts`, unit-tested |
| QR tag generation and regeneration | met |
| Seed script | met |
| `docs/phase-1.md` | met by this file — written late, during Phase 2 |
| Branch protection on `main` | met — a PR needs one approving review before it can merge |
| Integration test: full create → fetch → edit flow against a Dockerized test database | **not met** — there is no test database |

Eight of ten met, one open, one fixed but not yet merged. Both of the open-or-broken ones are
infrastructure, and neither is fixed by writing more application code.

The Docker one had been recorded as met, on the strength of the image building in CI. It does build.
It just does not run: Prisma 7 dropped the automatic postinstall `generate`, so `pnpm install` leaves
`@prisma/client` a stub, and generating on the host does not help because `docker-compose.yaml` masks
`/app/node_modules` with an anonymous volume. CI's docker job never starts a container, so nothing
ever asked. It surfaced when someone finally ran the Phase 2 walkthrough against a real database, and
the one-line fix is #10 — which is the general lesson of this section rather than a footnote to it:
**every criterion here that was verified by a green check rather than by use should be read as
provisional.**

## Known gaps at the end of Phase 1

**1. No test database — the one that matters.** Every route test in the repo, in all phases, mocks
`prisma`. A mock cannot catch a wrong `where` clause: `where: { id }` in place of
`where: { id, status: "PENDING" }` passes every assertion while silently removing a race guard. So
"the flow works end to end" is currently established by assertion, not by evidence, and each phase's
integration-test criterion is unmet for the same reason.

CI already injects `DATABASE_URL` and `DIRECT_URL` from repository secrets, so the plumbing is
half-built. Two ways to finish it:

- **An ephemeral Neon branch per CI run** — create a branch, point `DATABASE_URL` / `DIRECT_URL` at
  it, `prisma migrate deploy`, run the tests, delete the branch. Needs a Neon API key as a repository
  secret. This is the cheaper of the two by a wide margin, because `lib/prisma.ts` keeps using the
  Neon WebSocket adapter unchanged.
- **A local Postgres service** in `docker-compose.yaml` and a CI `services:` block. This *also*
  requires choosing the adapter at construction time in `lib/prisma.ts` — the Neon WebSocket adapter
  cannot talk to a plain Postgres — which is the fiddly part.

Either way, interactive transactions work, so Phase 2's approval transaction would finally be
exercised for real.

**2. No frontend.** `/frontend` is an empty placeholder. React + Vite + Tailwind is planned.

**3. `GET /items` returns `Prisma.Decimal` cost fields to Staff and Admin.** `JSON.stringify`
renders a Decimal as a *string*, so the API answers `"45000"`, not `45000`. Nothing in the backend
depends on this; the frontend and Phase 3's reports both will, and should settle the shape
deliberately rather than discover it.

## Verification

From `backend/`:

```bash
pnpm install
pnpm exec prisma generate
pnpm run lint
pnpm run build      # type-checks the .test.ts files too — this is where CI usually breaks
pnpm test
```

From the repo root, with a `.env` (copy `.env.example` and fill in the first three values):

```bash
docker compose up --build     # backend on :4000
curl localhost:4000/health    # {"status":"ok"}
```

Until #10 merges, that second line will not answer: the app exits at startup on a stub
`@prisma/client`. If you have an older container lying around, `docker compose down -v` before `up` —
the anonymous volume over `/app/node_modules` outlives the container and will hand a rebuilt image
the previous `node_modules`.

Then `pnpm prisma:seed` from `backend/` for two users, five categories, and demo items with QR tags.
Credentials are printed by the seed and are also listed in `docs/phase-2.md` → "Seed data".

To check branch protection, ask the branch, not the rules. GraphQL's `branchProtectionRules` and
`rulesets` both return an **empty list** to anyone who is not the repository owner, which reads
exactly like "there is no protection" and is how this document originally got it wrong. The honest
check works with plain read access:

```bash
gh api repos/<owner>/<repo>/branches/main --jq .protected        # true
gh pr view <n> --json mergeStateStatus,reviewDecision            # BLOCKED / REVIEW_REQUIRED
```

## Where to go next

`docs/phase-2.md` — transfer and disposal approvals, item edit history, accessory bundles,
notifications, and the integration that wired this phase's item routes to Phase 2's rules.



