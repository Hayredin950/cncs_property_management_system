-- `updatedAt` on `Item` and `Request` — the "how long has this been waiting?"
-- column the expiry and escalation windows need.
--
-- The expiry services ask two questions:
--
--   * an item still in `REVERTED_UNVERIFIED` — waiting for a new head to verify
--     it — has been waiting longer than the handover window;
--   * a request still in `RETURN_PENDING_CONFIRMATION` — the borrower said "I
--     am handing this back", the lender has not checked it in — has been waiting
--     longer than the return window.
--
-- Both are questions about *when the state was entered*, and both were
-- answered by filtering on a column that does not exist. `prisma` rejects the
-- unknown field at query time, so every one of those endpoints answered 500
-- instead of answering. There was no way to fix it in the service alone: the
-- timestamp had to exist.
--
-- `@updatedAt` is Prisma-managed: it is written on every update, so it answers
-- "when did this row last change" — which for these two states is exactly when
-- the state was entered, because nothing else touches the row while it waits.
--
-- Existing rows are backfilled with their own `createdAt`/`registeredAt` rather
-- than "now": a row created before this migration has been waiting since it was
-- created, and dating it to the migration would silently reset every window
-- and make stale rows look fresh.
--
-- The column is NOT NULL with a default so the backfill can run in one
-- statement; the default is then dropped, because from here on Prisma writes
-- the value on every create and update.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "Item" SET "updatedAt" = "registeredAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Item" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Item" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "Request" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Request" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Request" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Prisma writes `updatedAt` itself on every create and update, so the column
-- must not carry a database default: a default would make the value "whenever
-- the row was touched by anything at all", including a raw SQL write that never
-- went through the application.
ALTER TABLE "Item" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Request" ALTER COLUMN "updatedAt" DROP DEFAULT;
