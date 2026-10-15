-- Add escalation fields to User model for proper escalation tracking
-- These fields replace the reviewNote string hack for escalation tracking

ALTER TABLE "User" ADD COLUMN "escalatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "escalatedById" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
