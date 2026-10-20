-- Repair the migration history: materialize the tables the schema declares but
-- the migrations never created.
--
-- What went wrong
-- --------------
-- Four tables exist in `schema.prisma` and in the live database, but **no
-- migration in this folder creates them**: `OrgUnit`, `AccountRequest`,
-- `EmailToken` and `AdminActionLog`. They were made by running
-- `prisma db push` against the database directly, outside the migration
-- history. The migration history still creates the *old* shape — a `Department`
-- table with `User.departmentId` / `Item.departmentId` foreign keys — which the
-- schema no longer mentions at all.
--
-- The consequences, both reproduced against a fresh database:
--
--   * `prisma migrate deploy` fails with
--     `ERROR: relation "AccountRequest" does not exist` at
--     `20261014000000_account_invite_fields` — so a new environment, a CI
--     database or a colleague's laptop can never be built from the migrations;
--   * the live database is stuck on whatever revision it was pushed to, and
--     the privileged-invite columns the schema declares are still missing
--     there, so `POST /users/invite` cannot work.
--
-- What this migration does
-- -----------------------
-- It is deliberately **additive and idempotent**:
--
--   * `OrgUnit` is created if it is missing, and the rows of the legacy
--     `Department` table are copied into it (matched by name), so a database
--     that still has departments keeps its structure;
--   * `User.orgUnitId` and `Item.orgUnitId` are added if missing and backfilled
--     from the legacy `departmentId` where a matching unit exists;
--   * `AccountRequest`, `EmailToken` and `AdminActionLog` are created if
--     missing;
--   * the old `Department` table and the legacy `departmentId` columns are
--     **left in place**. They are inert (nothing reads them), and dropping
--     them belongs in the contract migration, not in a repair. Prisma ignores
--     columns the schema does not declare, so leaving them costs nothing and
--     keeps this migration reversible.
--
-- `IF NOT EXISTS` everywhere is what lets the same statement be correct on
-- both paths: it creates what is missing (fresh database) and does nothing
-- where it already exists (live database).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrgUnitType') THEN
    CREATE TYPE "OrgUnitType" AS ENUM ('COLLEGE', 'DEPARTMENT', 'LAB_GROUP');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountRequestStatus') THEN
    CREATE TYPE "AccountRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ESCALATED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailTokenType') THEN
    CREATE TYPE "EmailTokenType" AS ENUM ('VERIFY', 'INVITE', 'RESET');
  END IF;
END$$;

-- ---------------------------------------------------------------- OrgUnit --
CREATE TABLE IF NOT EXISTS "OrgUnit" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "OrgUnitType" NOT NULL DEFAULT 'DEPARTMENT',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "acceptsSelfReg" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "parentId" TEXT,
  "headId" TEXT,
  CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgUnit_name_key" ON "OrgUnit"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "OrgUnit_code_key" ON "OrgUnit"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "OrgUnit_headId_key" ON "OrgUnit"("headId");

-- Copy the legacy departments across, matched by name. The ids are preserved so
-- any row that already points at a department keeps pointing at the same unit.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Department')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'OrgUnit') THEN
    INSERT INTO "OrgUnit" ("id", "name", "code", "type", "isActive", "createdAt", "headId")
    SELECT d."id", d."name", d."code", 'DEPARTMENT', d."isActive", d."createdAt", d."headId"
    FROM "Department" d
    WHERE NOT EXISTS (SELECT 1 FROM "OrgUnit" u WHERE u."id" = d."id");
  END IF;
END$$;

-- ------------------------------------------------------- User / Item link --
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "orgUnitId" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "orgUnitId" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'User' AND column_name = 'departmentId') THEN
    UPDATE "User" u SET "orgUnitId" = u."departmentId"
    WHERE u."orgUnitId" IS NULL AND u."departmentId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "OrgUnit" o WHERE o."id" = u."departmentId");
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Item' AND column_name = 'departmentId') THEN
    UPDATE "Item" i SET "orgUnitId" = i."departmentId"
    WHERE i."orgUnitId" IS NULL AND i."departmentId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "OrgUnit" o WHERE o."id" = i."departmentId");
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "User_orgUnitId_idx" ON "User"("orgUnitId");
CREATE INDEX IF NOT EXISTS "Item_orgUnitId_idx" ON "Item"("orgUnitId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrgUnit_parentId_fkey') THEN
    ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_headId_fkey"
      FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_orgUnitId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_orgUnitId_fkey"
      FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Item_orgUnitId_fkey') THEN
    ALTER TABLE "Item" ADD CONSTRAINT "Item_orgUnitId_fkey"
      FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- ---------------------------------------------------------------- Building --
-- `Building` is the fourth table the schema declares and no migration creates:
-- it too was made by `prisma db push`. Without it the seed cannot run
-- ("TableDoesNotExist" on `prisma.building.upsert()`), so a database built from
-- the migrations alone was never usable end to end.
CREATE TABLE IF NOT EXISTS "Building" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" VARCHAR(10) NOT NULL,
  "description" TEXT,
  "address" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Building_name_key" ON "Building"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Building_code_key" ON "Building"("code");
CREATE INDEX IF NOT EXISTS "Building_code_idx" ON "Building"("code");

-- ------------------------------------------------------ Account machinery --
CREATE TABLE IF NOT EXISTS "AccountRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestedUnitId" TEXT NOT NULL,
  "confirmedUnitId" TEXT,
  "status" "AccountRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decidedById" TEXT,
  "decisionNote" TEXT,
  "rejectionReason" TEXT,
  "escalatedAt" TIMESTAMP(3),
  "escalatedById" TEXT,
  "escalationReason" TEXT,
  CONSTRAINT "AccountRequest_pkey" PRIMARY KEY ("id")
);
-- The five invite columns (authorizedBy, authorizationRef, authorizationNote,
-- invitedById, invitedAt) are deliberately NOT created here: the migration
-- that follows (`20261014000000_account_invite_fields`) adds them, and that
-- file is unchanged from the revision the live database already applied. Adding
-- them here as well would make that migration fail on a fresh database with
-- "column already exists" — and modifying that file would change its
-- checksum, which Prisma refuses for a migration that is already applied.

CREATE TABLE IF NOT EXISTS "EmailToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "EmailTokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminActionLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetUserId" TEXT,
  "unitId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountRequest_userId_key" ON "AccountRequest"("userId");
CREATE INDEX IF NOT EXISTS "AccountRequest_requestedUnitId_status_idx" ON "AccountRequest"("requestedUnitId", "status");
CREATE INDEX IF NOT EXISTS "AccountRequest_escalatedAt_idx" ON "AccountRequest"("escalatedAt");
CREATE INDEX IF NOT EXISTS "EmailToken_userId_type_idx" ON "EmailToken"("userId", "type");
CREATE INDEX IF NOT EXISTS "EmailToken_expiresAt_idx" ON "EmailToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "AdminActionLog_actorId_createdAt_idx" ON "AdminActionLog"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminActionLog_targetUserId_idx" ON "AdminActionLog"("targetUserId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountRequest_userId_fkey') THEN
    ALTER TABLE "AccountRequest" ADD CONSTRAINT "AccountRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AccountRequest" ADD CONSTRAINT "AccountRequest_requestedUnitId_fkey"
      FOREIGN KEY ("requestedUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "AccountRequest" ADD CONSTRAINT "AccountRequest_confirmedUnitId_fkey"
      FOREIGN KEY ("confirmedUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "AccountRequest" ADD CONSTRAINT "AccountRequest_decidedById_fkey"
      FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "AccountRequest" ADD CONSTRAINT "AccountRequest_escalatedById_fkey"
      FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailToken_userId_fkey') THEN
    ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminActionLog_actorId_fkey') THEN
    ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_unitId_fkey"
      FOREIGN KEY ("unitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
