-- Delete item request notifications for roles that should not see them (security fix)
-- SYSTEM_ADMIN and AUDITOR must not receive item request notifications
-- relatedRequestId is not null for item request notifications

DELETE FROM "Notification"
WHERE "userId" IN (SELECT id FROM "User" WHERE role IN ('SYSTEM_ADMIN', 'AUDITOR'))
  AND "relatedRequestId" IS NOT NULL;
