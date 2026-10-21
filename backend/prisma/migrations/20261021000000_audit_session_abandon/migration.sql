-- Let an audit session be abandoned.
--
-- A session's scope is frozen into its result rows when it opens, so a session
-- opened for the wrong scope cannot be completed honestly — and before this
-- migration there was no way to close one: it stayed "in progress" forever
-- and showed up in the "Active Audit" tile.
--
-- `abandonedAt` is separate from `completedAt` on purpose. A completed session
-- produced a report with a serial number; an abandoned one produced nothing,
-- and the difference is what stops an abandoned session being read as evidence.

ALTER TABLE "AuditSession" ADD COLUMN IF NOT EXISTS "abandonedAt" TIMESTAMP(3);
ALTER TABLE "AuditSession" ADD COLUMN IF NOT EXISTS "abandonReason" TEXT;

CREATE INDEX IF NOT EXISTS "AuditSession_abandonedAt_idx" ON "AuditSession"("abandonedAt");
