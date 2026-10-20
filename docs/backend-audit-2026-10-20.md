# Backend Code Audit — CNCS Property Management System

Audit of `backend/` as built (source of truth: the code, not the docs). Scope: `backend/prisma/schema.prisma`,
`backend/src/**` excluding `backend/src/generated/**`. Line references are to the current working tree.

---

## 1. Prisma schema (`backend/prisma/schema.prisma`)

### 1.1 Models (14)

| Model | Purpose / notable fields |
|---|---|
| `User` | `role`, `accountStatus` (lifecycle), `orgUnitRef` (replaces the old free-text `department`/`departmentId`), `staffId? @unique`, `tokenVersion` (JWT `ver` claim → revocation), `mustChangePassword` (retiring, still selected at login), review/escalation fields (`reviewedById/at`, `reviewNote`, `escalated*`), `headedOrgUnit` (head-of-unit inverse). Index on `accountStatus` (approval queue "oldest first"). |
| `AccountRequest` | Dedicated queue row keyed `@unique userId` → `User`, `requestedUnitId`/**`confirmedUnitId`** (the approver may change the unit), `status` PENDING_APPROVAL/APPROVED/REJECTED/ESCALATED, and sacrifice/authorization fields for privileged invites: `authorizedBy`, `authorizationRef`, `authorizationNote`, `invitedById/at`. |
| `OrgUnit` | College → Department → Lab/Group hierarchy (`parentId` self-relation), `isActive`, `acceptsSelfReg`, `headId @unique` (one head per unit, nullable = vacant). |
| `Building` | `name @unique`, `code @unique @varchar(10)`, `items` inverse. |
| `Category` | `name @unique`, `items` inverse. |
| `Item` | Core asset. `tagId @unique`, `pin? @unique` (lifetime asset number, never reused), `name`, `categoryId` (required), `orgUnitId?`/`buildingId?` + `floor`/`room` (free text), **holder model**: `holderType?` (`HolderType?`) + `holderId?` beside legacy `ownerId` (required, kept until the contract slice — both are written), `purchaseCost Decimal`, `currentValue?`, `condition`, `brand/model/serialNumber?`, `photoUrl?`, `status ItemStatus @default(ACTIVE)`, `disposalReason?/disposedAt?`, `registeredAt @default(now())`, `lastAuditedAt?`, claim handshake: `claimedAt?/claimDueAt?`, verification: `lastVerifiedAt?/lastVerifiedById/?`, void: `voidReason?/voidedAt?/voidedById?`, self-relation `parentItemId?`/`accessories` (accessories as sub-items), **`version Int @default(0)`** optimistic lock. Indexes: `(holderType, holderId)`, `status`, `orgUnitId`. |
| `CustodyEvent` | Append-only custody/audit-evidence log (spec 4.5): `eventType` + `fromHolderType/Id` + `toHolderType/Id` + `actingUserId`, `reason?`, `departmentHeadSnapshot?` ("who was responsible head at that moment", per 4.9.4). Index `(itemId, createdAt)`. Comment states the DB role is to be denied UPDATE/DELETE. |
| `Request` | Transfer/disposal/loan requests. `itemId` (required), `requestedById`, `reviewedById`, `reason` (required), `rejectionReason?`, destination: `newLocationBuilding/Floor/Room?`, `newOwnerId?` + new-style `fromHolderType/Id` → `toHolderType/Id`, **two-stage transfer approval**: `stage1ApprovedById/at`, `stage2ApprovedById/at` (stage 1 = releasing head, stage 2 = receiving head), loan: `loanDueDate?/loanReturnedAt?/loanReturnedById?`, withdrawal/invalidation: `withdrawnAt/ById`, `invalidatedAt/reason`, `decidedAt`. |
| `ItemEditLog` | One row per changed field ("never one row per edit"): `itemId`, `editedById`, `fieldChanged`, `oldValue String?/newValue String?`, `editedAt @default(now())`. |
| `AuditSession` | `sessionType` (Annual/Spot/Compliance/Handover), `reportNumber String? @unique` (serial of the frozen report), `scopeType`/`scopeValue?`, `runById`, `startedAt @default(now())`, `completedAt?`, `graceEndsAt?`. |
| `AuditItemResultRow` | One row per item per session, `@@unique([auditSessionId, itemId])` (prevents double-counting, gap-analysis A5), `result @default(PENDING)`, `scannedAt?`. |
| `Notification` | Minimal: `userId`, `message`, `relatedRequestId?`, `isRead`, `createdAt`. **No `type` column** — notification codes are stored as a `[CODE] ` prefix inside `message` (see services D-series decision D3). |
| `EmailToken` | One-time tokens: `type` (`VERIFY`/`INVITE`/`RESET`), **`tokenHash`** (never raw), `expiresAt`, `usedAt`. Index `(userId, type)` and `(expiresAt)`. |
| `AdminActionLog` | Immutable admin decision log: `actorId`, `action`, `targetUserId?`, `unitId?`, `before/after Json?`, `authorizedBy?/authorizationRef?` (copied from the invite payload). |

### 1.2 Enums (13)

- `Role` — 5 values (12 Oct change merged Account Admin into System Admin) → `SYSTEM_ADMIN | PROPERTY_OFFICER | DEPARTMENT_HEAD | STAFF | AUDITOR`
- `AccountStatus` — `ACTIVE | PENDING_EMAIL_VERIFICATION | PENDING_APPROVAL | REJECTED | DEACTIVATED`
- `AccountRequestStatus` — `PENDING_APPROVAL | APPROVED | REJECTED | ESCALATED`
- `HolderType` — `STAFF | DEPARTMENT | COLLEGE` (College = Property Office pool, `holderId` null)
- `Condition` — `NEW | GOOD | FAIR | DAMAGED | BEYOND_REPAIR`
- `ItemStatus` (7) — `PENDING_CLAIM | ACTIVE | REVERTED_UNVERIFIED | LOANED | LOST | DISPOSED | VOIDED` (plus LOANED, which spec's list predates)
- `RequestType` (3) — `TRANSFER | DISPOSAL | LOAN`
- `RequestStatus` (9) — `PENDING | PENDING_STAGE1 | PENDING_STAGE2 | APPROVED | REJECTED | WAITLISTED | WITHDRAWN | INVALIDATED | RETURN_PENDING_CONFIRMATION`
- `AuditItemResult` (5) — `PENDING | FOUND | MISSING | LOCATION_MISMATCH | DAMAGED`
- `AuditSessionType` (4) — `ANNUAL_FULL_COUNT | SPOT_CHECK | COMPLIANCE | HANDOVER`
- `CustodyEventType` (15) — `CREATED | CLAIMED | CLAIMED_WITH_CORRECTION | CLAIM_REFUSED | CLAIM_EXPIRED | REVERTED | TRANSFERRED | DISPOSED | DISPOSAL_REVERSED | LOST | RECOVERED | VOIDED | LOCATION_CHANGED | VERIFIED | HOLDER_DEACTIVATED | EDITED`
- `EmailTokenType` — `VERIFY | INVITE | RESET`
- `OrgUnitType` — `COLLEGE | DEPARTMENT | LAB_GROUP`

### 1.3 Schema mechanics

- **Datasource**: `datasource db { provider = "postgresql" }` with no `url`. The URL comes from **Prisma 7's `prisma.config.ts`** in `backend/`, not the schema — Prisma 7 moved datasource config there.
- **No `updatedAt` fields on `Item` or `Request`**. This matters: `routes/expiry.ts`, `services/expiry.ts` and `services/expiryEscalation.ts` filter on `updatedAt` — every one of these is a runtime failure (see §9).
- **Migration drift (important)**: migrations include `20261012000000_phase_a_expand` which adds FK **`User.departmentId`**/`Item.departmentId` → **`"Department"`** — a model that **does not exist in the current schema** (OrgUnit replaced Department). Meanwhile `20261012020000_backfill_holder_fields` documents the drops of `Item.department` (free text), `User.department` (free text), and `Item.ownerId` are *later* (contract) but `Item.ownerId` is still live. The migration history does not reduce to the current schema cleanly; a `prisma migrate dev` would churn, and a fresh DB built purely from `migrations/` gets a `Department` table + `departmentId` FKs the code can never see. Run `git log` + `migrate dev` with care before touching the DB.
- **Expand → contract** strategy is explicitly commented at the top of the schema: this change is additive; dropping `Item.ownerId`/`mustChangePassword` is deferred.

---

## 2. Routes & endpoints

### 2.1 Mounting (`src/app.ts`)

Routers are mounted at **both** `/api/v1/<name>` and `/<name>`, e.g. `/api/v1/items` and `/items` hit the same router. On top of that, the auth router registers **dual paths inside itself** (`["/account-requests","/auth/account-requests"]`, `["/login","/auth/login"]`, `["/me","/auth/me"]`, `["/change-password","/auth/change-password"]`, `["/accept-invite","/auth/accept-invite"]`), producing four effective aliases per pairing. Working endpoints, but the path surface is inconsistent and the frontends must agree on one canonical form.

### 2.2 Endpoint inventory

**`auth.ts`** (all dual-pathed)

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /account-requests` | public | Self-registration → `role: "STAFF"`, `accountStatus: PENDING_APPROVAL`. **Writes `department: parseResult.data.department` on User** — a scalar that does not exist in the schema → PrismaClientValidationError → 500. Never sets `orgUnitId`/`staffId`, so even if it worked the approval queue could not scope it to a unit. |
| `POST /login` | rate-limited (`createRateLimiter`, 10 attempts / 15 min, disabled under `NODE_ENV=test`) | Identifies by email (case-insensitive) **or** user id; argon2id verify; `signInRefusal(accountStatus)` gate runs *after* password check (avoids pending-account existence oracle): `PENDING_*`/REJECTED/DEACTIVATED → 403 with `accountStatus`; JWT (1 day) payload `{id, role, orgUnitId, ver: tokenVersion}`. |
| `GET /me` | `authenticate` | Profile replay. |
| `POST /change-password` | auth | Verifies old password (or admin-forced path via `mustChangePassword`), bumps `tokenVersion` → all other sessions die on next request ("ver" check). |
| `POST /accept-invite` | public | Consumes an `EmailToken type=INVITE` by hash; lets the person set their own password (the invite stored a random hash nobody knows). Sets `accountStatus` → ACTIVE. |
| `POST /request-password-reset` | public | Creates `EmailToken type=RESET` (SHA-256 hash stored, 1-hour `expiresAt`; link path only — no email sender wired). |
| `POST /reset-password` | public | Consumes a RESET token; bumps `tokenVersion`. |

**`items.ts`** (please note: register rules per §5)

| Endpoint | Capability | Notes |
|---|---|---|
| `GET /` | `authenticate` | Role-scoped list (`?scope=mine/department/other` for DEPARTMENT_HEAD/STAFF); `activeItemsWhere` (soft-delete by status). |
| `GET /recent` | `authenticate` | `take: limit` paginated. |
| `GET /held-by-me` | `authenticate` | |
| `GET /:tagId` | `authenticate`, or public tag-lookup not behind auth for non-privileged | Consult the item-visibility model: cross-department restricted field set (§9-sanitized); a disposed item returns 410 with `DISPOSED_PUBLIC_MESSAGE = "This item is no longer in service"`. |
| `POST /` | `ITEM_CREATE` | Generate `tagId`, picture record, PUT `holderType`/`holderId`/`ownerId`, claim-due stamp, custody `CREATED` event. |
| `POST /:id/photo` | `ITEM_EDIT_*` | `photoUpload` middleware, Cloudinary `public_id = tagId` overwrite. |
| `PUT /:id` | `ITEM_EDIT_IDENTITY` or `ITEM_EDIT_CUSTODY` (self-held only) | `version` optimistic lock; writes `ItemEditLog` rows + `EDITED` custody event per tracked field; notify reviewers via the request-workflow. |
| `POST /:id/reverse-disposal` | `DISPOSAL_REVERSE` | Sets status back to pre-disposal holder and `DISPOSAL_REVERSED` event. |
| `POST /:id/void` | `ITEM_VOID` | "Soft delete": `VOIDED` status + `voidedById`/`voidedAt`/`voidReason`, never a row deletion. |
| `POST /:id/claim` / `refuse-claim` / `claim-with-correction` | `ITEM_CLAIM` | Claim handshake; refuses notify both the claiming staff's and the item-'s department head; with-correction writes `CLAIMED_WITH_CORRECTION`. |
| `POST /:id/verify-confirm` / `verify-flag` | head-of-unit or property-officer | Used by hands-on verification; only allowed for items inside own department. |

**`requests.ts`**

| Endpoint | Capability | Notes |
|---|---|---|
| `POST /` | any authed user | **`REQUEST_TYPES = ["TRANSFER","DISPOSAL"]` only — `LOAN` requests cannot be created anywhere in the API** although `RequestType.LOAN` exists, `approve` handles LOAN (→ LOANED + due date), and return endpoints exist. Loan requests only exist if seeded directly. |
| `GET /pending-count` | auth | Badge count. |
| `GET /totals` | `REQUEST_READ_ALL` (property officer) | |
| `GET /` | per-reviewer scope | HEAD sees requests involving their department (`departmentId` filter on item's org-unit), their own; STAFF sees own; officer sees all. |
| `GET /:id` | per-reviewer scope | Detail incl. stage stamp list. |
| `POST /:id/approve` | `TRANSFER_APPROVE_STAGE1/2` or `DISPOSAL_APPROVE` or `LOAN_APPROVE` | `applyDecision` in `services/requestWorkflow.ts` — a single function decides: two-stage transfer (stage1→`PENDING_STAGE2`), single-stage disposal, loan (→ LOANED, `loanDueDate`, custody `TRANSFERRED`). Writes `Request.decidedAt` + `ItemEditLog` rows + notifications to requesters/reviewers. |
| `POST /:id/reject` | same | Standard reject with reason + notifications. |
| `POST /:id/withdraw` | requester only | Before approval. |
| `POST /:id/return-initiate` | borrower | LOANED → `RETURN_PENDING_CONFIRMATION` |
| `POST /:id/return-confirm` | lender/officer | → ACTIVE, custody `TRANSFERRED` back. |
| `POST /:id/return-dispute` | lender/officer | Keeps LOANED, records a dispute. |

**`users.ts`** (approval queue / accounts)

- `GET /approvals`, `GET /approvals/count` (role-filtered; head sees STAFF in own unit only, **and excludes any row whose `reviewNote` contains `[ESCALATED]`**, using reviewNote-as-flag strings).
- `POST /:id/approve` (`assertCanReview` = self-approval forbidden; role user-chosable defaults to STAFF; bumps `tokenVersion`), `POST /:id/reject`, `POST /:id/escalate` (head → SYSTEM_ADMIN; concatenated `[ESCALATED] Not in my department` onto `reviewNote`; notifies SYSTEM_ADMIN).
- `POST /invite` — privileged invites (SYSTEM_ADMIN only; `authorizedBy` + `authorizationRef` required and copied into `AdminActionLog`; random password hash so nobody knows the credential).
- `GET /invites`, `POST /invites/:id/resend`, `DELETE /invites/:id` — **`User.expiresAt` does not exist in the schema**; list + resend will error.
- `GET /users` — **no pagination** (pulls the entire list); `PATCH /:id`, `POST /:id/promote`, `POST /:id/deactivate` (head may deactivate STAFF in own unit only), `POST /:id/password` (admin reset → token bump), `DELETE /:id` (privileged only; hard `user.delete` is **physically done** — surprising given soft- destruction elsewhere, but active because FK constraints will fail if target holds items — see gap §9), `POST /org-units/:id/activate-head` (marks as new head, marks this unit's held items `REVERTED_UNVERIFIED`, reassigns pending approvals).

**`audits.ts`** (capability: `AUDIT_RUN` to open/run; `AUDIT_VIEW` to read)

- `POST /` (open session — writes one `AuditItemResultRow` per in-scope item as `PENDING`, thereby freezing the seen list), `POST /:id/scan` (records just `FOUND` + `scannedAt`; location mismatch and missing are computed at completion, not from scans), `POST /:id/complete` (marks `completedAt`, computes final `MISSING`/`LOCATION_MISMATCH`/`FOUND` per scan-less rows; allows re-open for a grace window; sets `graceEndsAt`), `GET /` (index), `GET /active`, `GET /findings`, `GET /:id` (frozen report with the report's serial `reportNumber`).

**`reports.ts`** (`REPORT_VIEW_ALL`)

- `GET /inventory?department&categoryId&status&dateFrom&dateTo&format=csv` — `department`/`building` columns are derived from the item's OrgUnit/Building at query time (the free-text columns were retired). CSV or JSON.
- `GET /audit/:auditId` — per-session report.
- `GET /disposals?dateFrom&dateTo&format=csv` — includes disposed rows (uses `allItemsWhere`).
- `GET /audit-evidence-pack` — **selects non-existent fields `sessionNumber`, `type`, `scope`, `itemCount` on `AuditSession`** (schema has `sessionType`, `reportNumber`, `scopeType`, and the row-level `AuditItemResultRow` list). Will predictably throw at runtime.

**`/catalog.ts`, `/ departments.ts`, `/export.ts, /notifications, /uploads, /systemConfig, /tags, /accessories, /loans, /expiry, /itemHistory, /buildings, /categories`** — see table in §2.2c.

<details><summary>Remaining endpoint inventory</summary>

| File | Endpoints | Capability notes |
|---|---|---|
| `catalog.ts` | `GET /` (cross-department), `GET /department` | department-head cross-department "restricted-visibility" search for finding transfer targets; strips cost/custodian/department fields (`sanitizeItem`); head-filter excludes own department. |
| `departments.ts` | `GET /` (public, `acceptsSelfReg` only), `GET /invitable` (privileged-invite target units), `GET /:id/roster`, `GET /:id/staff` (head-of-unit only, own unit). |
| `export.ts` | `GET /holdings` | CSV staff-holdings export. |
| `notifications.ts` | `GET /` (paginated), `POST /read-all`, `POST /:id/read`, `DELETE /:id` (single), `DELETE /` (clear all read). |
| `uploads.ts` | `POST /photo`, `DELETE /photo` | same multer middleware (`PhotoUpload`), used to upload a *pending* photo before an item row exists (`public_id = pending-<uuid>`). |
| `systemConfig.ts` | `GET /status`, `GET /events` | `SYSTEM_CONFIG`-only. |
| `tags.ts` | `GET /:id/tag` (PNG), `POST /:id/tag/regenerate` | `TAG_MANAGE`; QR-tag PNG is regenerated on the fly if missing. |
| `accessories.ts` | `POST /:id/accessories`, `DELETE /:id/accessories/:accessoryId` | accessories as sub-items of a parent. |
| `loans.ts` | `GET /overdue` | **no capability gate** — comment says "Property Officer only" but the next factor (`authenticate`) is the last middleware on the chain. |
| `expiry.ts` | `POST /check` (manual triggering of scan), `GET /status` | `SYSTEM_CONFIG` for both. **Uses `updatedAt` on Item — not in schema.** |
| `itemHistory.ts` | `GET /:id/history` | edit log merged with custody events, chronological. |
| `buildings.ts` | `GET /` list, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` | `BUILDING_MANAGE`; note `DELETE` is a true `prisma.building.delete` — FK-protected. |
| `categories.ts` | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` | `CATEGORY_MANAGE`; delete protected by FK. |

</details>

---

## 3. Middleware

| File | Behavior |
|---|---|
| `auth.ts` (`authenticate`) | JWT-verify; compares `ver` (tokenVersion) against DB row and rejects mismatches — but only when the token carries a `ver`. **Legacy tokens without `ver` skip the DB check entirely** (documented in schema comment: trusted until ≤1-day expiry). Attaches `req.user = {id, role, orgUnitId}`. |
| `auth.ts` (`requireCapability`, `requireAnyCapability`) | Calls `hasCapability(role, cap)` from `services/permissions.ts`; 403 on failure. |
| `validate.ts` | Zod `safeParse` on body/query/params with the generic 400 `error: first issue message, details: issues`. |
| `rateLimit.ts` | **In-house** fixed-window limiter keyed by IP (`createRateLimiter`), in-process `Map` counters; applied to `POST /auth/login` only; disabled under `NODE_ENV=test`. **Per-process** on a multi-instance deploy (Vercel), so it is per-container, not per-account. No distributed store. |
| `errorHandler.ts` | Central handler transitively wraps Prisma errors; maps `P2002` (unique) to 409, otherwise generic 500 `internal server error` + monolog-style error log; **no stack traces in responses**. |
| `photoUpload.ts` | `multer` with `memoryStorage` for real Cloudinary byte-streaming; **5 MB cap** (`PHOTO_MAX_BYTES`), MIME allowlist (`image/jpeg`, `image/png`, `image/webp`, `image/gif` — `multer` validates per-file), field name `photo`. Errors mask themselves into the route's 503 path when Cloudinary isn't configured. |

---

## 4. Services

| Service | What it does |
|---|---|
| `permissions.ts` | The authority for what a role may do; routes call `requireCapability`/`requireAnyCapability` (see §5 matrix). Two helpers (`seesFullItemDetail`) wrap item detail level. |
| `requestWorkflow.ts` | The single point that interprets POST /requests/:id/approve|reject: applies two-stage transfer, one-stage disposal, loan approval, waitlist, and full mutation set; computes stage stamps; produces custody events and notifications; keeps `Request` vs `Item` corrections aligned. | 
| `holder.ts` | Computes/normalizes `holderType`/`holderId` writes (`STAFF` user id, `DEPARTMENT` org-unit id, `COLLEGE` null); maintains the legacy `ownerId` twin for old readers. Custody-event constructors for each of the 15 types. |
| `itemScope.ts` | Scoping a list to "items in unit scope" — computes `unitScopeIds` recursively for a head (their unit's subtree). |
| `itemVisibility.ts` | Soft deletion by status: `activeItemsWhere(extra)` always pins `status: "ACTIVE"` last (so a caller's `?status=DISPOSED` cannot widen it — an asserted invariant), `allItemsWhere(extra)` is an identity function whose whole job is being greppable ("disposed items included on purpose here"), and the constant `DISPOSED_PUBLIC_MESSAGE = "This item is no longer in service"` quoted verbatim from an acceptance criterion (F7.3). |
| `itemEditLog.ts` | The diffing engine the edit/approval paths share: closed list `TRACKED_ITEM_FIELDS` (19 columns; excludes immutable ids, `registeredAt`, `lastAuditedAt`), decision D1 serialization (`null/undefined → SQL null`, decimal→2 places, date→ISO UTC, boolean → "true"/"false", enum→its own name, string→trimmed, FK→`"<label> (<id>)"` when a label is known), tracks per-field rows shared via an exact `editedAt` correlation key (there is no `requestId` column). |
| `auditCompletion.ts` | `collapseAuditRows()`/`computeAuditResults()`: scans only ever write `FOUND`, so completion walks the frozen `PENDING` rows and derives `MISSING`/`LOCATION_MISMATCH`; sets `completedAt` and `graceEndsAt`. |
| `expiry.ts` | Env-configurable windows; handles pending-claim expiry (unclaimed → back to COLLEGE), REVERTED_UNVERIFIED reversion. **Filters on `Item.updatedAt` — not in the schema → runtime failure.** |
| `expiryEscalation.ts` | **Same job, duplicated**: hardcoded 14-day cutoffs for claim/revert escalation and for the loan-return grace. **Also filters on `updatedAt` twice — runtime failure.** The duplication means validating one file's logic does not validate the other's, and fixing the `updatedAt` bug requires both. |
| `handover.ts` | On department-head change (`POST /org-units/:id/activate-head`): the unit's held items (ACTIVE or other) → `REVERTED_UNVERIFIED`; pending request approvals assigned to the *old* head are reassigned to the new one. |
| `approvers.ts` | `resolveApprover`: walks `OrgUnit` parents to find an active head, falls back SYSTEM_ADMIN when the whole chain is vacant (used by escalation paths and invite flows). |
| `accountApproval.ts` | Queue decision engine: `assertCanReview` forbids self-approval (`ERROR_SELF_REVIEW`); approval binds `reviewedById/at`, sets `accountStatus`, may set the account's role; bumps `tokenVersion`. Rejection writes `reviewNote`. |
| `invites.ts` | Privileged invites: unit selection, `authorizedBy` + `authorizationRef` required (copied to `AdminActionLog` in the same call), HMAC-random password hash (nobody knows the credential), `EmailToken type=INVITE` with SHA-256 hash. |
| `notifications.ts` | Builds in-app notifications (and optional email payloads). **Notification "codes" are stored as a `[CODE] ` text prefix in `message`** (backend D3) and parsed by `parseNotificationMessage()` — the there-is-no-`type`-column decision. `reviewerRecipientsWhere(requesterId, requestType)` returns the per-type Prisma `where` for finding reviewers (stage-1/stage-2 heads by unit, disposal/loan → property officer role filter), never just one. |
| `email.ts` | **Stub transport.** `NOTIFY_EMAIL` truthy gate → `console.info("[email] ... would send to ...")`; deliberately dependency-free; encapsulated in `deliver()` so a real SMTP can replace it line-for-line. Explicitly stated that the in-app notification is the real delivery mechanism, and that a transport must never throw inside a caller's transaction (post-commit only). |
| `photoStorage.ts` | Cloudinary via lazy `import` (so no credentials ⇒ no SDK load). Item-photo path `public_id = tagId`, `overwrite: true`, `invalidate: overwrite` (re-photographing replaces the old image — no orphans). Form-pending-photo path `public_id = pending-<uuid>`, `overwrite: false`. `PhotoUploadError` is a distinct class so routes map to 503, not 500. Folder: `cncs-pms/items`. Cloudinary chosen over disk because Vercel's filesystem is read-only apart from per-instance `/tmp`. |

---

## 5. Permissions matrix (`services/permissions.ts`)

`Role`-to-capabilities. Presence: holds; absence: nothing, and unknown roles fall through `?? []`.

| Capability | SYSTEM_ADMIN | PROPERTY_OFFICER | DEPARTMENT_HEAD | STAFF | AUDITOR |
|---|---|---|---|---|---|
| `ITEM_CREATE` | — | ✔ | — | — | — |
| `ITEM_EDIT_IDENTITY` | — | ✔ | — | — | — |
| `ITEM_EDIT_CUSTODY` | — | ✔ | ✔ | ✔ | — |
| `ITEM_CLAIM` | — | ✔ | ✔ | ✔ | — |
| `ITEM_VOID` | — | ✔ | — | — | — |
| `ITEM_READ_ALL` | **—** | ✔ | ✔ | — | ✔ |
| `BUILDING_MANAGE` | — | ✔ | — | — | — |
| `TAG_MANAGE` | — | ✔ | — | — | — |
| `CATEGORY_MANAGE` | — | ✔ | — | — | — |
| `AUDIT_RUN` | — | — | — | — | ✔ |
| `AUDIT_VIEW` | — | ✔ | — | — | ✔ |
| `REQUEST_DECIDE` | — | ✔ | ✔ | — | — |
| `TRANSFER_APPROVE_STAGE1` | — | ✔ | ✔ | — | — |
| `TRANSFER_APPROVE_STAGE2` | — | ✔ | ✔ | — | — |
| `DISPOSAL_APPROVE` | — | ✔ | — | — | — |
| `DISPOSAL_REVERSE` | — | ✔ | — | — | — |
| `LOAN_APPROVE` | — | ✔ | — | — | — |
| `REQUEST_READ_ALL` | — | ✔ | — | — | — |
| `REPORT_VIEW_ALL` | — | ✔ | ✔ | — | ✔ |
| `ACCOUNT_MANAGE` | ✔ | — | — | — | — |
| `ACCOUNT_APPROVE_OWN_UNIT` | — | — | ✔ | — | — |
| `ACCOUNT_APPROVE_ANY` | ✔ | — | — | — | — |
| `ACCOUNT_INVITE` | ✔ | — | — | — | — |
| `ACCOUNT_DEACTIVATE_OWN_UNIT` | — | — | ✔ | — | — |
| `ACCOUNT_DEACTIVATE_PRIVILEGED` | ✔ | — | — | — | — |
| `SYSTEM_CONFIG` | ✔ | — | — | — | — |
| `USER_READ` | ✔ | ✔ | — | — | — |

Design intent (documented in-file): SYSTEM_ADMIN is deliberately **an account role with no asset data** — it does not get `ITEM_READ_ALL`, sees no item rows, approves nothing business-related. `seesFullItemDetail` = `ITEM_READ_ALL`. Capability = "may do"; per-request scope = "which" (the route checks per-row).

---

## 6. Auth flows

1. **Self-registration** `POST /auth/account-requests` → currently broken: writes the `department` string the schema doesn't have, and never sets `orgUnitId`/`staffId`/account-request unit. Intended: `role=STAFF`, `accountStatus=PENDING_APPROVAL`, no token issued.
2. **Login** `POST /auth/login` → rate-limited; email-or-id identifier (email case-insensitive); argon2id; after password pass, `signInRefusal(accountStatus)`; `PENDING_*`/REJECTED/DEACTIVATED → 403 with `accountStatus` (not 401 — that would leak account state); active → token `{id, role, orgUnitId, ver}` 1-day.
3. **Token revocation** — JWT carries `ver = User.tokenVersion`; `authenticate` re-reads the row when `ver` present and rejects on mismatch. Password change/reset/role change bumps `tokenVersion`. Legacy tokens without `ver` skip the DB check (non-breaking rollout; ≤1 day of residual validity).
4. **Change password** — verifies old password or accepts the `mustChangePassword` path; bumps `tokenVersion`.
5. **Password reset** — public flow creates `EmailToken type=RESET` (hash-only, 1 h) — the *email-sending* side is the `services/email.ts` stub; receipt of the URL from the email channel is the consumer's problem.
6. **Accept invite** — public: consumes a hashed `INVITE` token and sets a new password (the invite stored a random credential hash, so nobody knows it). Approval sets `accountStatus=ACTIVE`; the account is usable.
7. **Approval queue** — `POST /users/:id/approve` binds the role (SYSTEM_ADMIN decides; DEPARTMENT_HEAD sees only STAFF in own unit), forbids self-approval, and escalates head submissions (`[ESCALATED] Not in my department` marker in `reviewNote`) to SYSTEM_ADMIN.
8. **Deactivation** — head may deactivate STAFF in own unit; SYSTEM_ADMIN may deactivate privileged accounts (`ACCOUNT_DEACTIVATE_PRIVILEGED`). Deactivated users can't sign in (account gate). Holder-deactivated items write a custody `HOLDER_DEACTIVATED` event; `handover.ts` handles per-unit deactivation side effects.

---

## 7. Workflows (as the code implements them)

### 7.1 Item lifecycle
```
register (ITEM_CREATE) → PENDING_CLAIM ──claim──> ACTIVE ──revert──> REVERTED_UNVERIFIED
(COLLEGE pool otherwise; claimDueAt expiry reverts to COLLEGE with
 CUSTODY CLAIM_EXPIRED)   refuse → CLAIM_REFUSED (both heads notified)
confirm/correction → CLAIMED / CLAIMED_WITH_CORRECTION
DISPOSED (via request) → DISPOSAL_REVERSED re-activates
LOANED (via loan request) → RETURN_PENDING_CONFIRMATION → ACTIVE / dispute → LOANED
LOST (audit completion grace expiry, per missing item)
VOIDED (as "soft delete" replacing delete) — the row is never deleted
```
Registered at `registeredAt @default(now())`; audits set `lastAuditedAt`; hand-on writes set `lastVerifiedAt/ById`; custody events write to `CustodyEvent` for every transition.

### 7.2 Transfer request (two-stage)
1. Requester (staff, or head on behalf of the unit) files a `TRANSFER` with destination (building/floor/room) and target holder. Status `PENDING` (or, for head-filed cross-unit, straight to `PENDING_STAGE1`).
2. **Stage 1** — releasing-head or property-officer approves with `TRANSFER_APPROVE_STAGE1`; `stage1ApprovedById/At`; status `PENDING_STAGE2`.
3. **Stage 2** — receiving-head or property-officer approves with `TRANSFER_APPROVE_STAGE2`; `stage2ApprovedById/At`, `decidedAt`, item mutates: holder `from→to`, custody `TRANSFERRED`, location fields updated, notifications to requester.
4. Competing requests on the same item while another is promised become `WAITLISTED`.
5. Requester can `WITHDRAW` pre-approval. Any request on an item whose status changed (voided/disposed) becomes `INVALIDATED` with a reason.

### 7.3 Disposal request (single-stage)
Requester files DISPOSAL with reason → `PENDING` → property officer approves (`DISPOSAL_APPROVE`) → item `DISPOSED`, `disposalReason`, `disposedAt`, custody `DISPOSED`. Reversal (`DISPOSAL_REVERSE`) restores the pre-disposal holder; hidden rows stay queryable in reports (`allItemsWhere`).

### 7.4 Loan workflows
- `approve` on a LOAN request sets item `LOANED` + `loanDueDate`; custody `TRANSFERRED`.
- Borrower `return-initiate` → `RETURN_PENDING_CONFIRMATION`; lender/officer `return-confirm` → ACTIVE + custody `TRANSFERRED`; `return-dispute` keeps LOANED and records the dispute.
- `GET /loans/overdue` reports LOANED items past due.
- **Hole: nothing can create a LOAN request** (`REQUEST_TYPES` excludes it) — see §9 #5.

### 7.5 Audits
- `POST /audits` opens a session (`AUDIT_RUN`, auditor role) and **freezes** the in-scope item list by writing one `AuditItemResultRow` per item with `result=PENDING` — completion computes only from this frozen set, not a fresh query.
- `POST /:id/scan` — the setter only records `FOUND` + timestamp. It cannot mark MISSING; **MISSING and LOCATION_MISMATCH are computed at completion** (`auditCompletion.ts`).
- `POST /:id/complete` sets `completedAt`, `reportNumber?` on audit; marks the session read-only and opens a **grace window** (`graceEndsAt`) during which flagged MISSING may be recovered before auto-escalation to LOST.
- `GET /audits/…` requires `AUDIT_VIEW` (property officer sees findings to act on them; auditor sees everything).
- Reports side gets `GET /reports/audit/:auditId` and (broken) `GET /reports/audit-evidence-pack`.

### 7.6 Handover / head change
- `POST /org-units/:id/activate-head` ⇒ new head bound; this unit's items mostly revert to `REVERTED_UNVERIFIED` (unauthenticated verification state); pending approvals are reassigned; department-head snapshot retained in custody history.

### 7.7 Expiry / escalation
- **Two divergent implementations do overlapping work** (`services/expiry.ts` env-configurable vs `services/expiryEscalation.ts` hardcoded): pending-claim expiry, reversion, and loan/return-grace escalation. Both currently reference `Item.updatedAt` (not a schema field) — see §9.
- Audit-scoped escalation is the one that also writes `LOST` after `graceEndsAt`.

### 7.8 Notifications
- `notifications.ts` builds NUM rows from workflow events with `[CODE] ` message prefixes (request submitted/approved/rejected, escalation, of loan, claim refusal, head change, etc.) and may also push the code into the stub email side-channel (`NOTIFY_EMAIL` on, `console.info` transport).
- The notification reader (route) parses the `[CODE]` prefix back out to tag types for filtering/badging.

---

## 8. Item holder model (spec 4.1)

- `Item.holderType` (`HolderType?`) + `Item.holderId` is the canonical "who has the item" pair; `holderType = COLLEGE` means the Property Office pool and deliberately stores `holderId = null`.
- **Legacy `Item.ownerId` is retained** (a required FK) and is still deliberately written by new code, until the contract migration drops it — reads on it are still live in several paths, so the two fields can drift if any writer forgets one. `services/holder.ts` is the shared writer and is the mechanism meant to keep them aligned.
- Every custody transition writes an append-only `CustodyEvent` with `from/to` holder pairs, the acting user, and `departmentHeadSnapshot` (because heads change over time, spec 4.5 / 4.9.4). The append-only property is enforced by DB role permissions per the schema comment, not by application code.
- `Item.version` gives optimistic locking: writers send the version read, mismatch fails loudly rather than silently overwriting (gap-analysis A7) — e.g. `PUT /items/:id`.
- Claim handshake (spec 4.4): items are minted `PENDING_CLAIM` with a `claimDueAt`; expiry expiry reverts unclaimed items back to the COLLEGE pool (`CLAIM_EXPIRED`); a claim refusal notifies both affected department heads; `claim-with-correction` records the `CLAIMED_WITH_CORRECTION` event.
- `departments`/`orgUnit` naming drift lives here too: `Item.orgUnitId` is the real department linkage, and the filters on `departmentName` are relational joins through `orgUnitRef.name` (the classic free-text `department` column is gone).

---

## 9. Gaps, red flags, and likely runtime failures (the important list)

1. **`POST /auth/account-requests` writes `department` on User** (`routes/auth.ts:131`) — no such field since the contract migration dropped free-text `User.department`. Every self-registration lands in a `PrismaClientValidationError` → 500. It also never sets `orgUnitId`/`staffId`, so the approval queue (`GET /users/approvals`) — which filters `orgUnitId ∈ unitScope` for department heads — could never see these rows even if the insert worked.
2. **`routes/users.ts` selects/writes `User.expiresAt`** (GET `/users/invites`, POST `/users/invites/:id/resend`) — the field only exists on `EmailToken`, not User. Both invitations endpoints are broken. `<User model has no expiresAt at all>`.
3. **`GET /reports/audit-evidence-pack` selects non-existent AuditSession fields** (`sessionNumber`, `type`, `scope`, `itemCount`; `routes/reports.ts:630-658`). Schema has `sessionType`, `reportNumber`, `scopeType`, `scopeValue` and a `results[]` relation. Guaranteed 500 (mis-built during the audit-feature rename).
4. **`updatedAt` referenced on `Item`/`Request` in four places** (`routes/expiry.ts:71`, `services/expiry.ts:170`, `services/expiryEscalation.ts:214,276`) — neither model declares `updatedAt`. The whole expiry/escalation surface (`POST /expiry/check`, `GET /expiry/status` and both services) fails at runtime.
5. **LOAN requests can never be created**: `REQUEST_TYPES = ["TRANSFER","DISPOSAL"]` in `requests.ts:64`, yet `RequestType.LOAN` exists, approve/return/dispute endpoints handle it, and `loans.ts` reports on it. The loan workflow is approval-ready but has no intake unless data is seeded directly.
6. **`GET /loans/overdue` has no capability check** beyond `authenticate` — comment says "Property Officer only", code does not require anything. Every authenticated role (including STAFF, and auditors) sees the overdue dashboard count.
7. **Duplicate expiry implementations** (`services/expiry.ts` vs `services/expiryEscalation.ts`) with different window configuration sources (env vs hardcoded) — the same job to do, and the same broken `updatedAt` filter in both. Consolidation candidate.
8. **Redundant path surface**: every router mounted at both `/api/v1/x` and `/x` in `app.ts`, and auth endpoints double-registered (`/login` + `/auth/login`, etc.) → four aliases per auth pairing. CORS/allowlist and tests only cover some.
9. **`mustChangePassword` is still on login select** although the flow document says it is retiring with the admin-acceptance invite flow (self-registration chooses an own password). Field is default FALSE and only meaningful for legacy rows.
10. **Schema ↔ migration drift**: `20261012000000_phase_a_expand` adds a `Department` model FK (`User.departmentId`, `Item.departmentId`) and a `DepartmentHead`-snapshot etc. that no longer appear in the schema (OrgUnit replaced it). `20261012020000_backfill_holder_fields` documents `Item.department` free-text drop that has happened in SQL already, while `Item.ownerId` remains. A fresh migrate against a clean DB does not reproduce the deployed schema (extra `Department` table + unexpected NOT NULL `department` column in the init migration).
11. **Per-object in-process rate limiter**: `createRateLimiter` is an in-memory fixed-window in the worker process; on a serverless/multi-instance platform (this is the very Notary/Neon+Vercel-style deployment) the limit applies per container and resets on cold start.
12. **`GET /users` has no pagination** — the approval-queue listing does, the full-listing endpoint doesn't; and the 200-row cap on `GET /users` in the future is real but unattended.
13. **Stale naming in test fixtures**: `test-utils/index.ts` still uses `"ACCOUNT_ADMIN"` for `makeAdmin` and `TestRole` (a role the schema and the permission matrix merged into SYSTEM_ADMIN on 12 Oct), and AuthenticatedRequest still maps `departmentId` in some routes even though the token carries `orgUnitId`. The five-role rename drifts.
14. **`parseNotificationMessage` token-codes**: no `type` column (deliberate D3 decision), so any change in message wording is backwards-incompatible for the reader — a coupling the two decision docs (D3/SRS F8.2) call out, but worth flagging to the report.
15. **Email is a stub**: `NOTIFY_EMAIL=true` only causes `console.info`. Anything the frontends expect from "email sent" (reset-link receipt by the user, invite emails) does not actually reach a mailbox. The only usable channels are in-app notification + shared URL degrees.
16. **`DELETE /users/:id` performs a hard `prisma.user.delete`** while item/void/asset flows are soft-deletion by design; it is FK-protected so it simply fails when the user holds items or decisions — worth stating near the top of the gap list, because the app-mindset has already shifted to soft deletions.

---

## 10. Test coverage

37 test files (`*.test.ts`), all **unit/integration tests given a mocked `prisma.*` layer via `vi.mock` in-suite** (`backend/src/test-utils/index.ts` provides only fixture builders; the Prisma-mock factory is deliberately copy-pasted into each suite because `vi.mock` is hoisted).

| Area | Files |
|---|---|
| Middleware | `auth.test.ts`, `validate.test.ts`, `rateLimit.test.ts`, `errorHandler.test.ts` |
| lib | `dbRetry.test.ts` |
| Routes | `auth.test.ts`, `authSession.test.ts` (revocation via `ver`), `invites.test.ts`, `items.test.ts`, `requests.test.ts`, `audits.test.ts`, `audits.integration.test.ts`, `reports.test.ts`, `notifications.test.ts`, `uploads.test.ts`, `tags.test.ts`, `systemConfig.test.ts`, `users.test.ts`, `gapFixes.test.ts`, `itemHistory.test.ts`, `accessories.test.ts`, `categories.test.ts` |
| Services | `holder.test.ts`, `itemEditLog.test.ts` (pins serialization/D1 and claim-correction state), `itemScope.test.ts`, `itemVisibility.test.ts` (asserts `activeItemsWhere` pin-last), `auditCompletion.test.ts` (`collapseAuditRows`/`computeAuditResults`), `requestWorkflow.test.ts`, `accountApproval.test.ts`, `invites.test.ts`, `notifications.test.ts`, `email.test.ts` |
| Utils | `csv.test.ts`, `pdf.test.ts`, `filterItemFields.test.ts`, `tagSticker.test.ts`, `qrGenerator.test.ts` (tests set env inside the test for the `process.env`-read-lazily rule the modules follow). |

Gaps in coverage, reading the list against the code: **nothing covers `expiry.ts`/`expiryEscalation.ts`** (the two runtime-broken services in §9 #4 — no test exists to catch it), **nothing covers `loans.ts`** (the missing-approval bug in §9 #6), and nothing tests the redundant dual mounting (`app.ts` itself is not on the test list). Routes like `items/photo`, `uploads/photo` have upload-success tests, but nothing asserts the 5MB / MIME reject paths. Runner is `vitest`; no coverage tooling configured.
