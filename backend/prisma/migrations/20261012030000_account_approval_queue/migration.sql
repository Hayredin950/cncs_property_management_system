-- Account-approval queue bookkeeping (spec 3.1.2).
--
-- `User.accountStatus` has existed since the Phase A expand migration but nothing
-- ever wrote it: every account was created ACTIVE, which is the gap the supervisor
-- flagged — there was no way for a person to ask for an account and no step at
-- which an administrator said yes. This adds the record of that decision: who
-- decided, when, and (for a rejection) why, so the queue can be answered from the
-- row itself rather than from a log.
--
-- No data migration: every existing row is legitimately `ACTIVE` and has nothing
-- to review, so the three columns stay null and stay that way. `createdAt` is the
-- request time — a self-request is what creates the row — so there is no separate
-- `requestedAt`.
--
-- ON DELETE SET NULL on the reviewer: removing an administrator's account must not
-- be blocked by, or cascade into, the accounts they once approved. The decision
-- stands; only the name attached to it goes.

ALTER TABLE "User" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "User" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "reviewNote" TEXT;

CREATE INDEX "User_accountStatus_idx" ON "User"("accountStatus");

ALTER TABLE "User"
  ADD CONSTRAINT "User_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
