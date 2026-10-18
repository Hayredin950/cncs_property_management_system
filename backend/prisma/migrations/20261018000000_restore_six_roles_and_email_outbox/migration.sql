-- Add ACCOUNT_ADMIN to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNT_ADMIN';

-- Add version column to User and Request for optimistic locking
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- Ensure unique constraint on Item.serialNumber
CREATE UNIQUE INDEX IF NOT EXISTS "Item_serialNumber_key" ON "Item"("serialNumber");

-- Create Designation table
CREATE TABLE IF NOT EXISTS "Designation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Designation_userId_designation_orgUnitId_idx" ON "Designation"("userId", "designation", "orgUnitId");

DO $$ BEGIN
    ALTER TABLE "Designation" ADD CONSTRAINT "Designation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Designation" ADD CONSTRAINT "Designation_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Designation" ADD CONSTRAINT "Designation_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create EmailOutbox table
CREATE TABLE IF NOT EXISTS "EmailOutbox" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailOutbox_status_createdAt_idx" ON "EmailOutbox"("status", "createdAt");

-- DB-level append-only triggers for log tables
CREATE OR REPLACE FUNCTION prevent_log_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Log tables are append-only. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_admin_action_log_mod ON "AdminActionLog";
CREATE TRIGGER trg_prevent_admin_action_log_mod
BEFORE UPDATE OR DELETE ON "AdminActionLog"
FOR EACH ROW EXECUTE FUNCTION prevent_log_modifications();

DROP TRIGGER IF EXISTS trg_prevent_custody_event_mod ON "CustodyEvent";
CREATE TRIGGER trg_prevent_custody_event_mod
BEFORE UPDATE OR DELETE ON "CustodyEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_log_modifications();

DROP TRIGGER IF EXISTS trg_prevent_audit_result_row_mod ON "AuditItemResultRow";
CREATE TRIGGER trg_prevent_audit_result_row_mod
BEFORE UPDATE OR DELETE ON "AuditItemResultRow"
FOR EACH ROW EXECUTE FUNCTION prevent_log_modifications();
