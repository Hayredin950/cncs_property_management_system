# Backend Delivery Plan — Three Phases
## CNCS Property Management System
**Version 1.0 | Depends on: SRS v1.0, SDS v1.0**

---

## 0. How This Works

Three groups (7–9 people total, exact split confirmed tomorrow), three phases, each phase ships in **2 days**, phases run **sequentially** — Phase 2 starts only once Phase 1 is merged into `main` and actually runs, Phase 3 starts once Phase 2 is merged and runs. After all three (6 days), the whole team shifts to frontend for the remainder of the 2 weeks.

Each phase section below has a **goal**, a **feature list** (core + "go further" additions, since AI-assisted coding means a team of this size can afford to build a bit ahead of the bare minimum), **testing requirements**, **documentation requirements**, and **exit criteria** — the exact bar that must be true before the next team is unblocked. How each phase's group splits its own internal tasks is up to that group once headcount is confirmed; this plan defines *what* ships, not who does which line of code.

---

## 1. Practices That Apply to All Three Phases (non-negotiable, from day one)

These aren't a "phase 4" — every phase is built on top of them starting Day 1 of Phase 1.

### 1.1 Containerization
- `docker-compose.yml` at the repo root from the very first commit, with two services: `backend` (the Node/Express API) and `db` (Postgres). Nobody should ever need to install Postgres locally — `docker compose up` is the entire setup.
- `backend/Dockerfile` written in Phase 1 and reused/extended by every later phase — new features don't get new containers, they get new code inside the existing one.
- `.env.example` checked into the repo (never the real `.env`) so anyone cloning the repo knows exactly which environment variables to set.
- Each phase's exit criteria includes: "runs correctly via `docker compose up` with no manual steps outside the README."

### 1.2 Git Branching
- `main` is protected — no direct pushes, only merges via Pull Request.
- Branch naming: `phase1/<short-task-name>`, `phase2/<short-task-name>`, `phase3/<short-task-name>` (e.g. `phase1/auth-jwt`, `phase2/transfer-approval`) — this also makes it obvious at a glance which phase a branch belongs to.
- Every PR needs at least one other teammate's review before merging, even a quick one — this is the cheapest bug-catcher available and costs almost nothing with a team this size.
- Commit messages should say *what* and *why* in one line (e.g. `Add server-side field filtering for public item view` not `fix stuff`).

### 1.3 CI/CD (from the first commit, not bolted on later)
Set up a GitHub Actions workflow (`.github/workflows/backend.yml`) in Phase 1 that runs on every push/PR to `backend/**`:
1. Install dependencies
2. Lint (`eslint`)
3. Run unit tests
4. Build the Docker image (catches "works on my machine" issues immediately)

Every phase adds its tests into this same pipeline — by Phase 3, the pipeline is testing the whole backend automatically on every PR, not just the newest code. A PR that fails CI should not be merged, no exceptions — this is what makes three groups touching the same codebase sequentially actually safe.

### 1.4 Testing — per phase, not at the end
- Every phase writes unit tests **for the logic it introduces**, before moving to the next phase. Use `jest` (or `vitest`) + `supertest` for API route tests.
- Priority for what to test: business rules and edge cases over simple CRUD (e.g., the server-side field-filtering rule in Phase 1 is far more important to test than "can I create an item").
- Tests run in CI (1.3) automatically — a phase isn't "done" if its own tests don't pass in the pipeline.

### 1.5 Documentation & Comments
- Each phase adds a `docs/phase-N.md` file: what was built, key decisions made, how to run/test it, and anything the next phase's team needs to know.
- The root `README.md` gets updated by every phase (not rewritten — added to) so by Phase 3 it's a complete "how to run this whole backend" guide.
- Code comments are expected on anything non-obvious: business rules (like the field-filtering logic), any place a decision was made that isn't the "obvious" way, and every function that isn't self-explanatory from its name. The goal: any teammate — or their AI tool — can open a file cold and understand *why*, not just *what*.
- Since the team is AI-assisted, "the AI wrote it" is not an excuse to skip comments — if anything it makes them more necessary, since the next person prompting AI to extend that code needs the context too.

---

## 2. Phase 1 — Foundation (Days 1–2)

### Goal
Everything Phase 2 and Phase 3 will build on top of: the project actually runs in Docker, the database schema exists, auth works, and core item data (including the single most important business rule in the whole system — public field filtering) is live and tested.

### Core deliverables (map to SRS F1, F2, F3)
- Repo scaffolded: `/backend`, `/frontend` (empty placeholder for now), `docker-compose.yml`, `.env.example`, GitHub Actions pipeline live and passing on an empty/starter test.
- Full Prisma schema from the SDS (Section 2) implemented and migrated — even the parts Phase 2/3 will use (Request, AuditSession, Notification models), so nobody has to touch the schema file simultaneously later and cause merge conflicts.
- Auth: register (admin-only, per F1.3), login, `/auth/me`, JWT issuing/verification middleware, bcrypt password hashing, role-check middleware (Admin/Staff/Public guard) reusable by every future route.
- Categories: `GET /categories`, `POST /categories` (admin).
- Items: `POST /items` (with auto Tag ID generation), `GET /items` (search/list), `GET /items/:tagId`, `PUT /items/:id`.
- **QR generation**: on item creation, generate the QR (via the `qrcode` package) encoding the item's future public URL, store/serve it via `GET /items/:id/tag`.
- **The field-filtering rule (SDS 3.2)** implemented and correct: public/non-owner requests never receive `ownerId` details, `purchaseCost`, `currentValue`, `brand`, `model`, `serialNumber`, `notes`, or `accessories` in the response body.
- A seed script (`prisma/seed.ts`) that populates a handful of categories and sample items — so Phase 2/3 (and later, frontend) always have real data to build against instead of an empty database.

### Go further than the minimum (since this is AI-assisted, aim past bare CRUD)
- Input validation on all endpoints (e.g. with `zod`) — not just "does it work," but "does it reject bad data with a clear error."
- Pagination on `GET /items` from the start (`?page=&limit=`) — retrofitting pagination later is far more annoying than building it in now.
- A basic rate limiter or at least request logging middleware (e.g. `morgan`) — cheap to add now, useful for debugging every phase after.
- Tag regeneration endpoint (F3.5) — small, and means Phase 2 doesn't need to touch tag logic at all.

### Testing requirements
- Unit tests: password hashing/verification, JWT sign/verify, role-check middleware (Admin/Staff/Public all behave correctly).
- **Highest priority test in this entire phase:** the field-filtering logic — a test that proves a public/anonymous request to `GET /items/:tagId` never contains restricted fields, and an owner/staff request does.
- Integration test: full create → fetch → edit item flow via `supertest` against the Dockerized test database.

### Documentation
- `README.md`: how to run `docker compose up`, how to run migrations/seed, how to run tests, how to hit the API (a few example `curl` calls).
- `docs/phase-1.md`: schema decisions, auth approach, and — critically — a clear note flagging exactly where the field-filtering logic lives, since Phase 2 and 3 will add new endpoints that must respect the same rule.

### Exit criteria (must be true before Phase 2 starts)
- [ ] `docker compose up` runs the full stack with zero manual steps beyond copying `.env.example`
- [ ] CI pipeline is green on `main`
- [ ] Auth, categories, and item CRUD endpoints work end-to-end against a real (seeded) database
- [ ] Field-filtering test passes and is understood by the team as the rule every future endpoint must respect
- [ ] `docs/phase-1.md` and README are complete enough that someone who wasn't in this group could run and understand the project cold

---

## 3. Phase 2 — Workflows & Notifications (Days 3–4)

### Goal
Everything that makes this more than a static database: the transfer/disposal approval chain, item history, and notifications — all built on the schema and auth Phase 1 already shipped.

### Core deliverables (map to SRS F2.2, F2.3, F6, F7, F8)
- Requests: `POST /requests` (type `TRANSFER` or `DISPOSAL`), `GET /requests` (filterable by status — this is the reviewer's queue), `GET /requests/:id`.
- Approval logic: `POST /requests/:id/approve` (applies the change to the `Item`, sets item status `DISPOSED` for disposal requests, logs the change), `POST /requests/:id/reject` (with required rejection reason).
- **Business rule enforcement:** a request's creator can never approve/reject their own request — this must be enforced server-side, not assumed from the UI.
- Item edit history: every `PUT /items/:id` and every approved request writes an `ItemEditLog` row (who, when, what field, old → new value).
- Accessories: `POST /items/:id/accessories` to link accessory items to a parent (F2.2).
- Notifications: `Notification` rows created automatically when a request is submitted (notify reviewer/admin) and when a request is decided (notify requester); `GET /notifications`, `POST /notifications/:id/read`.

### Go further than the minimum
- A `GET /items/:id/history` endpoint that returns the full edit log for one item — small addition, very useful for the frontend team and for demo/grading ("look, full accountability trail").
- Email notification as an optional add-on behind a feature flag/env variable (`NOTIFY_EMAIL=true/false`) — if there's time, flip it on; if not, in-app notifications (already required) still fully satisfy F8.
- A `GET /requests/pending-count` lightweight endpoint — trivial to add now, saves the frontend team from over-fetching later for a dashboard badge.

### Testing requirements
- Unit tests: approval state machine (pending → approved / pending → rejected, and that a decided request can't be re-decided).
- Test that self-approval is blocked (the requester-can't-approve-their-own-request rule).
- Test that approving a `DISPOSAL` request actually flips the item's status and that a disposed item disappears from default `GET /items` results but is still fetchable via history/reports.
- Test that notifications are created on both submission and decision.

### Documentation
- `docs/phase-2.md`: the request/approval state machine explained plainly, and how notifications are triggered — Phase 3's audit/reporting work will need to read from these same tables.
- README updated with new endpoint examples.

### Exit criteria (must be true before Phase 3 starts)
- [ ] Full transfer and disposal flows work end-to-end (create request → approve/reject → item updates accordingly)
- [ ] Self-approval is provably blocked (test passes)
- [ ] Notifications fire correctly on both submission and decision
- [ ] Edit history is being recorded and retrievable
- [ ] CI pipeline still green, now covering Phase 1 + Phase 2 tests together
- [ ] `docs/phase-2.md` complete

---

## 4. Phase 3 — Audit, Reporting & Backend Wrap-Up (Days 5–6)

### Goal
The scan-assisted audit system, exportable reports, and a final pass that makes sure the whole backend — all three phases combined — is genuinely ready to hand off to the frontend team.

### Core deliverables (map to SRS F9, F10)
- Audit sessions: `POST /audits` (start, with scope), `POST /audits/:id/scan` (mark an item `FOUND`), `POST /audits/:id/complete` (computes `MISSING` for unscanned in-scope items and `LOCATION_MISMATCH` for scanned items whose location doesn't match scope), `GET /audits/:id/report`.
- Reports: `GET /reports/inventory?format=csv`, `GET /reports/audit/:auditId?format=csv`, `GET /reports/disposals?format=csv` — all filterable where it makes sense (date range, department, category).
- On audit completion, update each involved item's `lastAuditedAt`.

### Go further than the minimum
- PDF export variant of each report (SRS marks this P1/cut-first, but if Phase 3 has time, it's a nice-to-have — build CSV first and treat PDF as a stretch add-on behind the same endpoint via `?format=pdf`).
- A `GET /audits` list endpoint (audit history, not just one session) — useful for reporting later and barely any extra work given the schema already supports it.
- A lightweight `/health` endpoint and basic OpenAPI/Swagger doc generation (e.g. `swagger-jsdoc`) — this becomes the single API reference the frontend team works from instead of re-reading this SDS line by line.

### Testing requirements
- Unit tests: mismatch computation logic (an item not scanned in-scope → `MISSING`; scanned but wrong location → `LOCATION_MISMATCH`; scanned and correct → `FOUND`).
- Integration test: full audit session lifecycle (start → scan a few items → complete → report reflects correct results).
- Report generation tests: CSV output has correct headers/rows for at least one report type.
- **Full-backend regression pass:** by now CI is running Phase 1 + 2 + 3 tests together — this phase's team should do one deliberate pass confirming nothing from Phase 1/2 broke.

### Documentation
- `docs/phase-3.md`: audit computation logic explained, report format notes.
- Final README pass: this is the version the frontend team will actually read — make sure `docker compose up`, seed data, and a full list of available endpoints (or a link to the generated API docs) are all there and accurate.
- A short **handoff note** (`docs/backend-handoff.md`): what's built, what's stretch/not built (PDF, email notifications if skipped), any known rough edges, and the field-filtering rule restated one more time since the frontend team must respect it too (never trust the frontend alone to hide restricted fields — it's already enforced server-side, but the frontend shouldn't try to display fields the API doesn't send).

### Exit criteria (must be true before the team shifts to frontend)
- [ ] Audit session flow works end-to-end and produces a correct mismatch report
- [ ] All three report types export valid CSV
- [ ] Full CI pipeline (all three phases' tests) green on `main`
- [ ] `docker compose up` still brings up the entire, fully-featured backend with zero manual steps
- [ ] API reference (Swagger or a clear docs file) exists and is accurate
- [ ] `docs/backend-handoff.md` written and understandable by someone who's only touched frontend so far

---

## 5. What's Next

Once Phase 3's exit criteria are met, the next document is the **frontend execution plan** — page-by-page, mapped to the API contract this backend plan just delivered, with its own phase/day breakdown for the remaining time in the two weeks. Ready whenever you want it, or if you'd like the **day-by-day breakdown within Phase 1** first since that's the one your team is starting tomorrow.
