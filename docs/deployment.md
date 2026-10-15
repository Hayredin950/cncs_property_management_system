# Deployment

Both halves run on Vercel, from this repository, with auto-deploys on push to
`main`. The database is Neon; item photos live in Cloudinary.

> **Read this with §11 of [`monolithic-system-design.md`](./monolithic-system-design.md).**
> This page documents the Vercel projects **as configured**; it does not decide which
> revision they build. Both projects build `main`, and `main` is **not** the canonical
> branch — `phase-a-b-complete` is, and it is ahead of `main`. So "push to `main`" deploys
> the old revision, which is the exact failure §11.2 was written about. Deploy only after
> §11.1's build is green, and then prove the live revision behaviourally (a route that
> exists only on the new revision, called and answered) — a Vercel "Ready" badge is not
> proof of it.

| Piece | Project | URL |
| --- | --- | --- |
| Frontend (static Vite build) | `cncs-pms-web` | https://cncs-pms-web-hayredins-projects.vercel.app |
| Backend (one serverless function) | `cncs-pms-api` | https://cncs-pms-api-hayredins-projects.vercel.app |
| Database | Neon project **CNCS PMS**, branch `production` | — |
| Photos | Cloudinary cloud `r3rzw77s` | — |

## The two projects

The repository holds both halves, so each Vercel project sets **Root Directory**
to its half (`frontend` / `backend`) and both build the same `main` branch.

**`cncs-pms-web`** is an ordinary static deploy. `frontend/vercel.json` sets the
framework to `vite` and adds the SPA catch-all rewrite, so a deep link like
`/items` serves `index.html`. Vercel checks the filesystem *before* applying
rewrites, which is what keeps `/photos/*.jpg` and `/aau/*.png` working — verified
on the live URL, not assumed.

**`cncs-pms-api`** is the interesting one, because Vercel runs no long-lived
process and this backend is an Express server that calls `app.listen()`.

- `backend/api/index.js` exports the same Express app as a request handler.
  `src/server.ts` is still the entry for Docker and local dev; `src/app.ts` is
  untouched, so the routes, middleware and error handler deployed here are
  byte-for-byte what the 284 backend tests exercise.
- It imports from **`dist/`**, not `src/`: `tsc` already emits a self-contained
  build (it compiles `src/**`, including the Prisma client generated into
  `src/generated/prisma`), which keeps Vercel out of the ESM `.js`-suffixed
  import resolution that `nodenext` requires.
- `backend/vercel.json` routes every path to that function and caps it at 30s.

### Three things that fail differently on Vercel than locally

Each of these was a real deployment failure, recorded so the fix is not
re-discovered by hand:

1. **`prisma generate` must be part of the build.** Vercel ignored
   `vercel.json`'s `buildCommand` and ran the package script directly, leaving
   the generated client missing — every Prisma type collapsed to `any` and the
   build died with three `TS2307`s and thirty cascading `TS7006`s. It is now the
   first half of `package.json`'s `build`, so it runs on any platform instead of
   depending on that config being honoured. CI already generates first, so the
   second run is a no-op.
2. **Vercel finishes every build by looking for static output.** A
   function-only project needs a directory that exists and contains nothing, or
   the deploy dies with `No Output Directory named "public" found`. Hence
   `outputDirectory: "public"` plus a committed empty `backend/public/`.
   Pointing it at `dist/` would pass the same check and be worse: static files
   are served *before* rewrites, so the compiled server and its `.js.map` source
   maps — which embed the original TypeScript — would be publicly downloadable.
3. **`GET /items/:id/tag` writes a PNG to disk.** Vercel's filesystem is
   read-only apart from `/tmp`, so `UPLOADS_DIR=/tmp/uploads` here. That is
   safe only because the route regenerates a missing file from the tag id;
   photos, which cannot be regenerated, go to Cloudinary instead.

## Environment variables

Set on **`cncs-pms-api`** (Production and Preview):

| Key | Notes |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** endpoint — what the app connects through |
| `DIRECT_URL` | Neon **unpooled** endpoint — migrations only; `prisma.config.ts` reads it eagerly, so `prisma generate` fails at build time without it |
| `JWT_SECRET` | Changing it invalidates every issued token |
| `PUBLIC_BASE_URL` | The **frontend** origin — encoded into every printed QR sticker |
| `UPLOADS_DIR` | `/tmp/uploads` on Vercel |
| `NOTIFY_EMAIL` | `false`; the transport in `services/email.ts` is still a stub |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Omit all three to disable uploads (the route answers 503 and the item form falls back to a pasted URL) |
| `CORS_ORIGINS` | **Required in production.** Comma-separated frontend origin(s), e.g. `https://cncs-pms-web.vercel.app`. Unset in production now *denies* cross-origin requests (fail closed) and logs a warning at startup — set it or the browser calls between `-web` and `-api` will be blocked |

Set on **`cncs-pms-web`** (Production and Preview):

| Key | Notes |
| --- | --- |
| `VITE_API_BASE_URL` | Inlined into the browser bundle at **build** time, not read at runtime, so changing it needs a redeploy |
| `API_BASE_URL` | Read at **runtime** by `api/preview.ts`, the social-preview function. Falls back to `VITE_API_BASE_URL` when unset, so it is only needed if the two should differ |
| `VITE_SITE_ORIGIN` | Optional. Only used to build the absolute URLs in `index.html`'s social preview tags. Vercel infers it from `VERCEL_PROJECT_PRODUCTION_URL`, so set it only when a custom domain fronts the deployment |

> **The project needs its own `api/` function directory.** `frontend/vercel.json`
> rewrites crawler requests for `/item/:tagId` to `/api/preview`, which renders
> the item's real name and photograph into the link preview. If the Vercel
> project is ever configured to build only static files, those previews silently
> degrade to the generic card rather than failing loudly. See
> [archive/social-previews.md](./archive/social-previews.md) for how to verify it with `curl`.
>
> **As of 14 Oct this path is broken, and not silently.** `api/preview.ts` calls
> `GET /api/v1/items/:tagId` anonymously on the stated premise that the route is public,
> but `items.ts` now requires a token there (the public item routes were removed —
> `monolithic-system-design.md` §10.2). The function therefore gets a 401 and every shared
> tag degrades to the generic card. Read the archived doc for the mechanism, not for the
> current behaviour.

> **`PUBLIC_BASE_URL` is the one that bites later.** It is baked into every QR
> sticker at print time. Change it after printing labels and every existing
> sticker dead-ends, and nothing in CI can catch that, because both sides are
> behaving correctly.

## Deploying

Push to `main`; both projects rebuild. To drive it from the API instead:

```bash
TOKEN=<vercel-token>; TEAM=team_WojFl4QzVl8bw1s2rIRiME5v

curl -s -X POST "https://api.vercel.com/v13/deployments?teamId=$TEAM" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"cncs-pms-api","target":"production",
       "gitSource":{"type":"github","repoId":1380918889,"ref":"main"}}'
```

Migrations are **not** run by a deploy. Against a fresh database:

```bash
cd backend
pnpm exec prisma migrate deploy   # uses DIRECT_URL, the unpooled endpoint
pnpm prisma:seed                  # idempotent; prints the demo credentials
```

> **Apply the latest migration before serving the new build.**
> `20260924000000_add_token_version_and_password_reset` adds `User.tokenVersion`
> (session revocation) and `User.mustChangePassword` (forced change after an
> admin reset). Both are additive with defaults, so existing rows are fine, but
> the code reads them — a deploy that skips `migrate deploy` will fail with
> `column "tokenVersion" does not exist`.

### Two things block `migrate deploy` on the current database (14 Oct)

Both were found while building T6 (privileged invites), which is the first feature
that writes these columns.

1. **A failed migration is already in the history.** `_prisma_migrations` holds a
   **FAILED** row for `20261012000000_phase_a_expand` *and* an applied row for the
   same migration. Prisma refuses to run anything further while a failed migration
   is present (`P3009`). Resolve it deliberately — `prisma migrate resolve
   --rolled-back 20261012000000_phase_a_expand` if the applied attempt is the good
   one — rather than deleting the row by hand.
2. **Three tables exist without a migration that creates them.**
   `AccountRequest`, `EmailToken` and `AdminActionLog` are present in the database
   (`information_schema` confirms it), and no migration on disk creates any of the
   three: they were created outside the migration history, most likely by
   `prisma db push`. That is why `migrate deploy` against a *fresh* database would
   not produce the schema the code expects either.

**`20261014000000_account_invite_fields` is the migration T6 needs.** It adds the
seven invite columns (five on `AccountRequest`, two on `AdminActionLog`), the
`invitedById` foreign key and its index — all nullable, nothing backfilled. It was
verified by executing its SQL inside a transaction that was then rolled back
against the live database (seven columns and the foreign key created, database
unchanged), so it is known to apply cleanly; it has **not** been applied.
Until it is, every invite endpoint answers 500 with
`column AccountRequest.authorizedBy does not exist`.

## Settings worth knowing

- **Vercel Authentication is disabled** on both projects. It is on by default at
  the team level, and it answers every request with a 302 to an SSO page — which
  looks exactly like a broken API. For a public demo the API has to be
  reachable; the routes that should be private are behind JWT auth, and the
  public ones go through `sanitizeItem`'s field filtering.
- **CORS fails closed in production.** With `CORS_ORIGINS` set, only those
  origins get CORS headers. With it unset, development still allows everything,
  but a production process blocks cross-origin calls and warns at startup — so
  the variable must be set on `cncs-pms-api` for the web app to reach it.
- **Nothing here is on a paid plan.** The backend runs on Vercel's Hobby tier,
  so cold starts of a second or two are normal, and Neon's free compute
  suspends when idle — the first request after a quiet spell pays for it.
