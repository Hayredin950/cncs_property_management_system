-- Privileged-invite bookkeeping (T1 of the account-approval authority doc).
--
-- The four invite columns on `AccountRequest` and the two on `AdminActionLog` have
-- been in `schema.prisma` since the approval-queue work, but **no migration ever
-- created them** — `grep -rl "authorizedBy\|invitedById" backend/prisma/migrations`
-- returned nothing, and a live probe of the database confirmed the columns are
-- absent while `AccountRequest`, `EmailToken` and `AdminActionLog` themselves exist
-- (those three were created outside the migration history). So the schema was ahead
-- of the database, and the first privileged invite would have failed with
-- "column AccountRequest.authorizedBy does not exist".
--
-- Why these columns exist at all — D3 of `cncs-pms-account-approval-authority.md`:
-- no role inside the app sits above a Head, a Property Officer or an Auditor, and
-- SYSTEM_ADMIN (IT) cannot verify who holds an appointment. The authority is
-- outside the system (college office, administration, Office of Auditors), so the
-- system's job is to **record** that authority rather than to invent it:
--
--   authorizedBy       who authorized the appointment outside the system
--   authorizationRef   the letter number or equivalent, so it can be checked later
--   authorizationNote  anything else worth keeping with it
--   invitedById/At     which administrator issued the invite, and when
--
-- `AdminActionLog` carries the same two authorization fields because §0.4 makes
-- that log append-only: the invite row can be re-read and (in principle) edited,
-- while the log entry is the record that a decision was made under a named
-- authority at a point in time.
--
-- Every column is NULLABLE and nothing is backfilled. A staff self-registration has
-- no outside authority to record — it is approved by the person's own head — so the
-- invite fields are meaningful only on an invited row, and a NOT NULL constraint
-- would force a placeholder onto every existing request. Null means "this account
-- was not invited", which is exactly what was true of them.
--
-- `Demo` accounts and seed data need no change: the seed creates accounts directly
-- and they keep null invite fields, the same way `24fb728`'s queue migration left
-- `reviewedById` null on every row it did not apply to.

ALTER TABLE "AccountRequest" ADD COLUMN "authorizedBy" TEXT;
ALTER TABLE "AccountRequest" ADD COLUMN "authorizationRef" TEXT;
ALTER TABLE "AccountRequest" ADD COLUMN "authorizationNote" TEXT;
ALTER TABLE "AccountRequest" ADD COLUMN "invitedById" TEXT;
ALTER TABLE "AccountRequest" ADD COLUMN "invitedAt" TIMESTAMP(3);

ALTER TABLE "AdminActionLog" ADD COLUMN "authorizedBy" TEXT;
ALTER TABLE "AdminActionLog" ADD COLUMN "authorizationRef" TEXT;

-- ON DELETE SET NULL on the inviter, for the same reason the reviewer is: removing
-- an administrator's account must not be blocked by — nor cascade into — the
-- accounts they invited. The invitation stands; only the name on it goes.
ALTER TABLE "AccountRequest"
  ADD CONSTRAINT "AccountRequest_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AccountRequest_invitedById_idx" ON "AccountRequest"("invitedById");
