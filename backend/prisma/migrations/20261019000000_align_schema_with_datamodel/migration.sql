-- Align the migrated database with `schema.prisma`.
--
-- The gap
-- -------
-- The schema is the contract; the migration history had drifted away from it.
-- The drift came from `prisma db push` runs against the live database: columns
-- and enum values added that way exist in the database and in the schema, but
-- in no migration. A database built from `prisma/migrations/` therefore came
-- up missing them, and the first thing that touched those fields failed:
--
--   * `User.staffId` missing → the seed died on the first `user.upsert()`;
--   * `Request.status` missing `PENDING_STAGE1` / `PENDING_STAGE2` /
--     `WITHDRAWN` / `INVALIDATED` / `RETURN_PENDING_CONFIRMATION` → the
--     two-stage transfer, the withdrawal and the loan-return handshake had no
--     value to write;
--   * `CustodyEventType` missing `CLAIMED_WITH_CORRECTION` /
--     `DISPOSAL_REVERSED` / `VOIDED` → the custody trail could not record
--     half of what the workflows do;
--   * `Request` missing the stage/loan/withdrawal columns → the workflow
--     columns the code writes had nowhere to go;
--   * `Item.buildingId` missing → the free-text `building` column was still
--     the live one, and `Building` was never linked.
--
-- This migration is the additive half of the alignment. Everything here adds
-- what the schema declares and nothing removes what the database already
-- holds.
--
-- What it deliberately does NOT do
-- --------------------------------
-- `prisma migrate diff` also proposes dropping the legacy `Department` table
-- and the legacy `department` / `departmentId` / `building` columns. Those
-- drops are **not** in this migration:
--
--   * they are destructive, and a repair migration is the wrong place for a
--     destructive step;
--   * `Item.building` still holds data on the live database that no other
--     column has yet — the seed writes buildings by name/code, and the
--     backfill below copies them across, but the original text stays as the
--     record of what was there before;
--   * the project's expand→contract strategy (documented at the top of
--     `schema.prisma`) puts drops in a later, separately reviewed migration.
--
-- So the legacy objects stay, inert, and the next `migrate dev` will keep
-- proposing their removal — which is exactly the reminder we want.

-- ------------------------------------------------------------- enum values --
-- `ADD VALUE IF NOT EXISTS` so this migration is safe on the live database,
-- where these values already exist from the `db push` runs.

ALTER TYPE "CustodyEventType" ADD VALUE IF NOT EXISTS 'CLAIMED_WITH_CORRECTION';
ALTER TYPE "CustodyEventType" ADD VALUE IF NOT EXISTS 'DISPOSAL_REVERSED';
ALTER TYPE "CustodyEventType" ADD VALUE IF NOT EXISTS 'VOIDED';

ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_STAGE1';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_STAGE2';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'WAITLISTED';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'INVALIDATED';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'RETURN_PENDING_CONFIRMATION';

-- ------------------------------------------------------------------- User --
-- `staffId` is the institution's own staff number: unique, optional, and the
-- thing a head checks against the college list before approving a request.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "escalatedById" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_staffId_key" ON "User"("staffId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_escalatedById_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_escalatedById_fkey"
      FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- A new account starts as PENDING_EMAIL_VERIFICATION: nobody is ACTIVE until
-- somebody decides. The seed sets ACTIVE explicitly for the demo accounts.
ALTER TABLE "User" ALTER COLUMN "accountStatus" SET DEFAULT 'PENDING_EMAIL_VERIFICATION';

-- ------------------------------------------------------------------- Item --
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "buildingId" TEXT;

CREATE INDEX IF NOT EXISTS "Item_buildingId_idx" ON "Item"("buildingId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Item_buildingId_fkey') THEN
    ALTER TABLE "Item" ADD CONSTRAINT "Item_buildingId_fkey"
      FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- Copy the legacy free-text building onto the new relation where the name
-- matches a `Building` row. Rows that do not match keep a null `buildingId` —
-- an unmatched name is not a guess.
UPDATE "Item" i
   SET "buildingId" = b."id"
  FROM "Building" b
 WHERE i."buildingId" IS NULL
   AND i."building" IS NOT NULL
   AND lower(btrim(i."building")) = lower(btrim(b."name"))
   AND NOT EXISTS (SELECT 1 FROM "Item" x WHERE x."id" = i."id" AND x."buildingId" IS NOT NULL);

-- ---------------------------------------------------------------- Request --
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "stage1ApprovedAt" TIMESTAMP(3);
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "stage1ApprovedById" TEXT;
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "stage2ApprovedAt" TIMESTAMP(3);
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "stage2ApprovedById" TEXT;
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "loanDueDate" TIMESTAMP(3);
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "loanReturnedAt" TIMESTAMP(3);
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "loanReturnedById" TEXT;
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "withdrawnById" TEXT;
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "invalidatedAt" TIMESTAMP(3);
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "invalidatedReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Request_stage1ApprovedById_fkey') THEN
    ALTER TABLE "Request" ADD CONSTRAINT "Request_stage1ApprovedById_fkey"
      FOREIGN KEY ("stage1ApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Request_stage2ApprovedById_fkey') THEN
    ALTER TABLE "Request" ADD CONSTRAINT "Request_stage2ApprovedById_fkey"
      FOREIGN KEY ("stage2ApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Request_loanReturnedById_fkey') THEN
    ALTER TABLE "Request" ADD CONSTRAINT "Request_loanReturnedById_fkey"
      FOREIGN KEY ("loanReturnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Request_withdrawnById_fkey') THEN
    ALTER TABLE "Request" ADD CONSTRAINT "Request_withdrawnById_fkey"
      FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- ------------------------------------------- legacy NOT NULL constraints --
-- `Item.building` and `Item.department` are free-text columns from before the
-- `Building` relation and the `OrgUnit` relation existed. The schema no longer
-- declares them, and nothing in the application writes them any more — but in
-- the database they are still `NOT NULL`, so **every insert of an item failed**
-- with a null-constraint violation on a column the code does not even know
-- about. The seed died on the first item it tried to create.
--
-- The constraint is dropped, not the column: the data stays, and the columns
-- can be dropped later in the contract migration with the rest of the legacy
-- shape.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Item' AND column_name = 'building' AND is_nullable = 'NO') THEN
    ALTER TABLE "Item" ALTER COLUMN "building" DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Item' AND column_name = 'department' AND is_nullable = 'NO') THEN
    ALTER TABLE "Item" ALTER COLUMN "department" DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'User' AND column_name = 'department' AND is_nullable = 'NO') THEN
    ALTER TABLE "User" ALTER COLUMN "department" DROP NOT NULL;
  END IF;
END$$;

-- ---------------------------------------------------------------- OrgUnit --
-- `type` has no database default in the schema: a unit's tier is always
-- written explicitly.
ALTER TABLE "OrgUnit" ALTER COLUMN "type" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "OrgUnit_type_idx" ON "OrgUnit"("type");
CREATE INDEX IF NOT EXISTS "OrgUnit_parentId_idx" ON "OrgUnit"("parentId");

-- --------------------------------------------- relation delete behaviour --
-- The schema's required relations delete with RESTRICT, not CASCADE: an
-- account row that still has a request or a token must not be removed by a
-- cascade. The repair migration created these two with CASCADE; this aligns
-- them with the schema.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountRequest_userId_fkey'
             AND confdeltype = 'c') THEN
    ALTER TABLE "AccountRequest" DROP CONSTRAINT "AccountRequest_userId_fkey";
    ALTER TABLE "AccountRequest" ADD CONSTRAINT "AccountRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailToken_userId_fkey'
             AND confdeltype = 'c') THEN
    ALTER TABLE "EmailToken" DROP CONSTRAINT "EmailToken_userId_fkey";
    ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;
