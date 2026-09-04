# Contributing

Small team, parallel branches, one shared database. These rules exist because each of them has
already cost someone a merge conflict, a red build, or a duplicated implementation.

## Branches and PRs

- Branch from `main`: `<track>/<short-description>` — `phase1/access-control`,
  `phase2/notifications`, `phase3/audit-sessions`. Lowercase, dashes, no spaces.
- **No direct pushes to `main`.** Everything goes through a PR with one review.
- Rebase on `main` before asking for review, and again before merging if `main` moved.
- Write tests alongside the code, not after. CI runs them on every PR.
- A PR description should say what changed, what you tested, and anything you deliberately did not
  do. If it touches `schema.prisma`, it must say whether the migration was applied to Neon.

## The database is shared

One Neon instance backs everyone's local development.

- **Freeze `schema.prisma`.** Do not add a column, index or model on a feature branch. If you think
  you need one, raise it first — every phase so far has found a way not to.
- A schema change is its own PR, announced before it is merged, and the PR body states
  "migration applied to Neon: yes/no". CI cannot tell you: it runs `prisma generate`, which reads the
  schema *file*, so an unapplied migration passes every check and then fails at runtime with
  `column does not exist`.
- `prisma migrate` uses `DIRECT_URL` (unpooled); the app uses `DATABASE_URL` (pooled). Don't swap
  them.
- `pnpm prisma:seed` rewinds the demo fixtures it owns. If you are demoing off those rows, say so
  before someone re-seeds.

## Shared files

Three files are touched by every track. Treat them as append-only.

**`src/app.ts`** — one router mount per line, sorted by mount path. Add your line; never reorder or
reformat someone else's. Two people rewriting this file is the only merge conflict this project has
actually had. Two rules are load-bearing rather than stylistic:

- `notFoundHandler` and `errorHandler` stay last, in that order. Express 5 picks error handlers by
  arity (4 parameters) and only consults those registered *after* the middleware that threw.
- The most general route pattern is mounted last. `itemsRouter`'s `GET /:tagId` is a single-segment
  pattern, so it cannot currently swallow `/:id/history` — but if anyone adds a bare
  `GET /items/:id`, mount order becomes the only thing deciding the winner.

**`README.md`** — append to your own section. It is the answer to "what actually exists right now,"
so update it when you finish a track, not at the end of the phase.

**`.github/workflows/`** and **`docker-compose.yaml`** — changes here affect everyone's build. Own PR,
with a heads-up.

## Don't reimplement a rule that already exists

Import the helper. If two files enforce one rule, they will disagree eventually — and the disagreement
will be found by a user, not by a test.

This has already happened once: server-side field filtering was written twice, in two phases, and the
two versions disagreed on three fields (`docs/phase-2.md` → "C1"). The rules that exist today:

| Rule | Import from |
|---|---|
| Which item fields a viewer may see (SDS 3.2 / SRS 3.4) | `utils/filterItemFields.ts` → `sanitizeItem`, `isPrivilegedViewer` |
| Hiding disposed items from a listing (F7.2) | `services/itemVisibility.ts` → `activeItemsWhere` |
| Writing item edit history (F2.3) | `services/itemEditLog.ts` → `buildEditLogRows`, `writeEditLogRows` |
| Notification text and codes (F8) | `services/notifications.ts` |
| Aborting with a status code from inside a transaction | `lib/httpError.ts` → `httpError` |
| Request body / query validation | `middleware/validate.ts` |

If a shared helper needs to change for your work, change it in **its own PR**, tell whoever depends
on it, and keep that PR separate from your feature. A phase that quietly edits another phase's helper
inside a 3,000-line branch is how a regression ships.

## Code conventions

Everything here is enforced by `pnpm run lint` and `pnpm run build`, but knowing why saves a red
build.

- ESM: relative imports need a `.js` extension even in `.ts` files; type-only imports need
  `import type`.
- `.test.ts` files **are** type-checked by `pnpm build` (tsconfig `include` is `src/**/*.ts`). Vitest
  green is not CI green. Cast at mock boundaries with `as never`.
- `exactOptionalPropertyTypes`: build Prisma payloads with conditional spread,
  `...(x ? { field: x } : {})`. `noUncheckedIndexedAccess`: index access is `T | undefined`.
- Error responses are always `{ error: string }`, plus `details` for a zod failure. The four auth
  error strings are fixed — reuse them verbatim, tests assert on them (`docs/phase-1.md` → "The
  middleware contract").
- Never return `passwordHash`. Every route test ends with
  `expect(JSON.stringify(res.body)).not.toContain("passwordHash")` — keep that.
- Never echo a Prisma error message or its `meta` to a client; it names tables, columns and
  constraints. `middleware/errorHandler.ts` maps the common codes to generic bodies.
- Comment anything non-obvious, and say *why* rather than *what*. Assume the reader is a teammate in
  three weeks who is deciding whether they can change your line.

## Before you open a PR

From `backend/`:

```bash
pnpm install
pnpm exec prisma generate
pnpm run lint
pnpm run build
pnpm test
```

Every route test is mock-based — there is no test database yet — so for anything touching a
transaction or a `where` clause, also run it against a real database by hand and paste the output into
the PR. `docs/phase-2.md` → "Manual walkthrough" is the worked example.
