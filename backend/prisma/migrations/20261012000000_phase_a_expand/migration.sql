-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PENDING_EMAIL_VERIFICATION', 'PENDING_APPROVAL', 'REJECTED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "HolderType" AS ENUM ('STAFF', 'DEPARTMENT', 'COLLEGE');

-- CreateEnum
CREATE TYPE "AuditSessionType" AS ENUM ('ANNUAL_FULL_COUNT', 'SPOT_CHECK', 'COMPLIANCE', 'HANDOVER');

-- CreateEnum
CREATE TYPE "CustodyEventType" AS ENUM ('CREATED', 'CLAIMED', 'CLAIM_REFUSED', 'CLAIM_EXPIRED', 'REVERTED', 'TRANSFERRED', 'DISPOSED', 'LOST', 'RECOVERED', 'LOCATION_CHANGED', 'VERIFIED', 'HOLDER_DEACTIVATED', 'EDITED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditItemResult" ADD VALUE 'PENDING';
ALTER TYPE "AuditItemResult" ADD VALUE 'DAMAGED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ItemStatus" ADD VALUE 'PENDING_CLAIM';
ALTER TYPE "ItemStatus" ADD VALUE 'REVERTED_UNVERIFIED';
ALTER TYPE "ItemStatus" ADD VALUE 'LOANED';
ALTER TYPE "ItemStatus" ADD VALUE 'LOST';
ALTER TYPE "ItemStatus" ADD VALUE 'VOIDED';

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'WAITLISTED';

-- AlterEnum
ALTER TYPE "RequestType" ADD VALUE 'LOAN';

-- AlterTable
ALTER TABLE "AuditItemResultRow" ALTER COLUMN "result" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "AuditSession" ADD COLUMN     "graceEndsAt" TIMESTAMP(3),
ADD COLUMN     "reportNumber" TEXT,
ADD COLUMN     "sessionType" "AuditSessionType" NOT NULL DEFAULT 'ANNUAL_FULL_COUNT';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "claimDueAt" TIMESTAMP(3),
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "holderId" TEXT,
ADD COLUMN     "holderType" "HolderType",
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastVerifiedById" TEXT,
ADD COLUMN     "pin" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "fromHolderId" TEXT,
ADD COLUMN     "fromHolderType" "HolderType",
ADD COLUMN     "toHolderId" TEXT,
ADD COLUMN     "toHolderType" "HolderType";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "headId" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "eventType" "CustodyEventType" NOT NULL,
    "fromHolderType" "HolderType",
    "fromHolderId" TEXT,
    "toHolderType" "HolderType",
    "toHolderId" TEXT,
    "actingUserId" TEXT NOT NULL,
    "reason" TEXT,
    "departmentHeadSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_headId_key" ON "Department"("headId");

-- CreateIndex
CREATE INDEX "CustodyEvent_itemId_createdAt_idx" ON "CustodyEvent"("itemId", "createdAt");

-- Reconcile rows that already break the rule this migration is about to add.
-- The audit scan endpoint could write the same item more than once for one session
-- (gap-analysis A5), so a database that has been used already contains duplicates and
-- the unique index below cannot be created until they are gone. Verified on the shared
-- dev database before writing this: 117 rows over 33 distinct (session, item) pairs, and
-- no pair disagreed on either "result" or on whether it had been scanned — so collapsing
-- each pair to a single row loses no finding. The earliest scan wins, which is also the
-- first physical count; the id breaks ties deterministically.
DELETE FROM "AuditItemResultRow"
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY "auditSessionId", "itemId"
            ORDER BY "scannedAt" ASC NULLS LAST, id ASC
        ) AS rn
        FROM "AuditItemResultRow"
    ) ranked
    WHERE ranked.rn > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditItemResultRow_auditSessionId_itemId_key" ON "AuditItemResultRow"("auditSessionId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditSession_reportNumber_key" ON "AuditSession"("reportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Item_pin_key" ON "Item"("pin");

-- CreateIndex
CREATE INDEX "Item_holderType_holderId_idx" ON "Item"("holderType", "holderId");

-- CreateIndex
CREATE INDEX "Item_status_idx" ON "Item"("status");

-- CreateIndex
CREATE INDEX "Item_departmentId_idx" ON "Item"("departmentId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_lastVerifiedById_fkey" FOREIGN KEY ("lastVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_actingUserId_fkey" FOREIGN KEY ("actingUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

