-- Delete item request notifications belonging to SYSTEM_ADMIN users (security fix)
-- SYSTEM_ADMIN must not receive item request notifications - only account notifications
-- relatedRequestId is not null for item request notifications

DELETE FROM "Notification"
WHERE "userId" IN (SELECT id FROM "User" WHERE role = 'SYSTEM_ADMIN')
  AND "relatedRequestId" IS NOT NULL;
