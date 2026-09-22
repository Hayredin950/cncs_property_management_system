# Deployment

Where this system goes, and what has to change before it does. Written against the repo as it
stands — every claim below is checkable in the code it cites.

## 0. The short answer

> **Frontend → Vercel. Backend → a container host (Render, or Koyeb/Fly.io). Not Vercel.**

Vercel is the right home for the frontend and the wrong home for this backend, and the reason is
not a preference — it is one line of code. See §2.

**Do the backend first.** `VITE_API_BASE_URL` is baked into the browser bundle at build time
(`frontend/src/lib/env.ts`), so the frontend cannot be built until the backend has a final URL.
Deploying the frontend first means building it twice.

---

## 1. What each piece needs

| Piece | Needs | Fits |
| --- | --- | --- |
| `frontend/` | Static files + a CDN. Vite output is `dist/`. | Vercel, Netlify, Cloudflare Pages — anything static |
| `backend/` | A **persistent** Node 22 process, a **writable** filesystem, long-lived env vars | Render, Koyeb, Fly.io, Cloud Run, a VPS |
| Database | Managed Postgres with a pooled + unpooled URL | Neon (already chosen) |
| Images | Object storage + CDN | Cloudinary (already chosen) |

`backend/` is a `tsx watch` dev server in `docker-compose.yaml` today, but it does **not** need to
be: `package.json` already has the pair a production host wants.

```json
"build": "tsc",
"start": "node dist/server.js"
```

So `pnpm build && pnpm start` is a production server as-is. No rewrite required.

---

## 2. Why the backend can't go on Vercel

`backend/src/utils/qrGenerator.ts` writes generated QR PNGs to disk:

```ts
await ensureTagsDir();
const filePath = tagFilePath(tagId);
await fs.writeFile(filePath, buffer);   // ← EROFS on Vercel
```

That is reached from two places that both matter:

- `POST /items` calls `generateTagQR` when an item is created — so **registering an item would
  fail**;
- `GET /items/:id/tag` calls it on a cache miss — so **printing a sticker would fail**.

Vercel's filesystem is read-only apart from `/tmp`, which is per-invocation. You can survive that
by setting `UPLOADS_DIR=/tmp` (the route already regenerates a missing PNG, so a lost file
self-heals), but `/tmp` is per-instance and the readback is a different instance — so every
sticker print becomes a QR regeneration. It would _work_. It is not a good design, and it is more
moving parts than just choosing a host that gives you a disk.

The other Vercel mismatch is colder: `/tmp` and serverless aside, this is an Express app with
`app.listen()` (`backend/src/server.ts`). Deploying it means adding an `api/index.ts` adapter,
accepting cold starts on every staff action, and giving up on anything long-running later.

**If you specifically want everything on one host**, the cost is one real change: move QR PNGs
into object storage (Cloudinary, which you are already setting up) instead of disk. Then the
backend is stateless and genuinely Vercel-deployable. That is a code change, not a config change.

> Note also that Vercel's own catalog entry says it is "not suitable for backend-only workloads,
> long-running servers, or database hosting."

---

## 3. Backend host: the options that fit

| Host | Free tier | Cold start | Effort | Notes |
| --- | --- | --- | --- | --- |
| **Render** ⭐ | Yes (web service) | ~50s after 15 min idle | Lowest | Docker or Node buildpack; GitHub deploys; env vars in the dashboard. Best default for a one-off deployment. |
| **Koyeb** | Yes (1 service) | Sleeps on free | Low | Serverless containers, decent DX, HTTPS + env vars out of the box. |
| **Fly.io** | Small allowance | None | Medium | Micro-VMs; `flyctl launch`. No cold start on a paid ~$3/mo machine, which matters a lot for a live demo. |
| **Cloud Run** | Generous | Scale-to-zero | High | Needs a GCP project + Artifact Registry. Cheapest at idle, most setup. |
| **Hetzner + Coolify** | — | None | High | ~€4/mo VPS with full control; you own patching. Cheapest with no cold start, most work. |

**Recommendation: Render**, because it needs no new CLI and no Docker knowledge to get the first
deploy out, and the free tier is enough for an internship demo. Move to Fly.io if a 50-second cold
start in front of reviewers is unacceptable.

### What the backend service needs configured

| Setting | Value |
| --- | --- |
| Root directory / build context | `backend` |
| Build command | `pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm build` |
| Start command | `pnpm run start` |
| Health check path | `/health` |
| Node version | 22 |

> `prisma generate` must run **after** `pnpm install` and with the schema present. Prisma 7 dropped
> the automatic postinstall generate, so `pnpm install` alone leaves `@prisma/client` as a stub and
> the process dies with *"does not provide an export named `PrismaClient`"*. The existing
> `backend/Dockerfile` documents the same trap — it is not hypothetical.

### Migrations

Run once, from the host's shell or a one-off job, with the **unpooled** URL:

```bash
pnpm exec prisma migrate deploy
```

Do **not** run `prisma:seed` against production. The seed upserts fixed IDs
(`CNCS-DEMO-0001`…) and resets the demo request to `PENDING` — it is designed to be re-runnable on
a demo database, which means it will happily rewrite live rows.

---

## 4. Frontend on Vercel

`frontend/` is a self-contained pnpm package (its own `pnpm-lock.yaml` and
`pnpm-workspace.yaml`), so point the Vercel project at it rather than at the repo root.

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Framework preset | Vite |
| Build command | `pnpm run build` (from `frontend/vercel.json`) |
| Output directory | `dist` |
| Install command | `pnpm install --frozen-lockfile` |
| Environment variable | `VITE_API_BASE_URL` = the backend origin, **no** `/api/v1` and no trailing slash |

`frontend/vercel.json` is committed and carries the two things that matter: the build/output
settings, and a **catch-all rewrite to `/index.html`**. That rewrite is not optional here — this
is a `createBrowserRouter` SPA, and every QR sticker points at `/item/:tagId`. Without it, a
scanned sticker hits Vercel, finds no such file, and 404s. The app would work perfectly by
clicking around and break the moment anyone scanned a printed tag.

### Deploying it

```bash
cd frontend
vercel link            # first time: pick/create the project, confirm Root Directory = frontend
vercel env add VITE_API_BASE_URL production   # paste the backend URL
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard and let it build on push — better here, because
it makes the deployment reproducible instead of dependent on whoever's laptop ran the CLI.

---

## 5. Neon

The project already uses Neon with a driver adapter and expects **two** URLs, and they are not
interchangeable:

| Variable | Which one | Used by |
| --- | --- | --- |
| `DATABASE_URL` | pooled (`-pooler` in the host) | the running app |
| `DIRECT_URL` | unpooled | `prisma migrate` |

`prisma.config.ts` reads `DIRECT_URL` **eagerly at config load** and throws
`PrismaConfigEnvError` if it is unset — so an unset `DIRECT_URL` breaks the build, not just
migrations.

Use a **separate Neon project (or branch) for production**. Pointing production at the demo
database means the next seed run rewrites live data.

The Neon CLI steps (`neon link --project-id …`, `neon config init`, `neon deploy`) configure Neon's
own serverless-function deployment. They are optional here: this app's database is Neon, but its
compute is not, so nothing depends on them. If you want them anyway they are additive, not a
prerequisite.

---

## 6. Cloudinary

Account is created; the credentials needed are `CLOUD_NAME`, `API_KEY`, `API_SECRET`, and the
combined `CLOUDINARY_URL`.

**Important:** this backend has **no upload endpoint**. `photoUrl` is a plain `String?` column and
the item form accepts a URL. So there are two paths, and they are genuinely different amounts of
work:

**(a) External URLs — no backend change.** Upload photos through the Cloudinary media library UI,
copy each asset's delivery URL, paste it into the item form's photo field. Everything works today.

**(b) A real upload — code.** Add `POST /items/:id/photo` (multer → Cloudinary), plus a file picker
in `ItemFormPage`. The photo then lives in Cloudinary and only the URL is stored, which is the
right design. This is a feature, not configuration.

Prefer (b) if photos are part of the delivered scope: (a) leaves staff pasting URLs by hand, which
is the kind of step that quietly stops being done.

For **signed** uploads never expose `API_SECRET` to the browser — the secret belongs only in the
backend's env, and the frontend uploads through your endpoint. If you must upload directly from the
browser, use an unsigned upload preset instead, which is a deliberate, separate Cloudinary feature.

---

## 7. Environment variables

See `.env.production.example` at the repo root. Summary of what changes from local:

| Variable | Production note |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Neon **production** branch, pooled / unpooled respectively |
| `JWT_SECRET` | Generate fresh: `openssl rand -base64 48`. Never reuse the dev value |
| `PORT` | Usually set by the host — do not hardcode 4000 |
| `PUBLIC_BASE_URL` | The **frontend** origin. This is encoded into every printed QR sticker |
| `UPLOADS_DIR` | Writable path. On hosts with an ephemeral disk, expect PNGs to be regenerated |
| `CORS_ORIGINS` | Comma-separated frontend origins (see §8) |
| `NOTIFY_EMAIL` | `false` — the SMTP transport is a stub and there is no Resend account yet |

> ⚠️ `PUBLIC_BASE_URL` is baked into QR codes at print time. Change it after printing labels and
> every sticker already in the field dead-ends. Decide the frontend domain **before** printing.

---

## 8. CORS

`backend/src/app.ts` currently has bare `app.use(cors())`, which allows **every** origin. The app
now reads `CORS_ORIGINS`:

- **unset** → previous behaviour (allow all). Local dev and the test suite are unaffected.
- **set** → only those origins are allowed. Set it in production.

```bash
CORS_ORIGINS=https://cncs-pms.vercel.app,https://cncs.aau.edu.et
```

Note the frontend calls the API from the browser, so this is enforced by the browser, not the
server — it stops other sites from calling your API with a user's token, it does not make the API
private. Auth still does that.

---

## 9. Before this is public

- [ ] **Rotate the seed passwords.** `Admin123!` / `Staff123!` are hardcoded in
      `backend/prisma/seed.ts`, committed to this repo, and documented in the README. Change them
      for production, or create the real accounts through `/admin/users` and never run the seed.
- [ ] **Set `JWT_SECRET`** to a fresh 48-byte random value. An empty or guessable secret means
      anyone can mint a valid admin token.
- [ ] **Set `CORS_ORIGINS`** (§8).
- [ ] **Confirm `.env` is still gitignored.** It is, at both the root (`.gitignore:35`, which also
      covers `backend/.env`) and in `frontend/.gitignore`.
- [ ] **Do not commit `DATABASE_URL`, `API_SECRET`, `JWT_SECRET` or `VERCEL_TOKEN`.** Every one of
      these belongs in the host's environment dashboard, never in a tracked file.
- [ ] Rotate any credential that has been pasted into a chat, a screenshot, or an issue.

---

## 10. Still open

- **Which backend host** — pick one and I can write its deploy config. Render is the recommendation.
- **Cloudinary path (a) or (b)** — external URLs, or build the upload endpoint.
- **Final domains** — frontend origin and backend origin, needed before QR labels are printed.
- **Email** — deliberately skipped while there is no Resend (or other) account. In-app
  notifications work fully; `NOTIFY_EMAIL=true` only logs because `services/email.ts` is a stub.
- **`uploads/` durability** — on a host with an ephemeral disk, QR PNGs are regenerated on demand
  rather than stored. Functional, slightly wasteful, and worth revisiting if sticker volume grows.
