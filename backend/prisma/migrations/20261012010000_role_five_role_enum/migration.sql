-- The role enum moves from ADMIN/STAFF to the five spec roles (2.1, amended
-- 12 Oct: the Account Admin merged into SYSTEM_ADMIN, so five roles, not six).
--
-- Data mapping: the one pre-existing `ADMIN` account is the account-owner
-- persona the seed calls "System Admin", so it becomes SYSTEM_ADMIN — the role
-- that now owns invites, approvals, deactivation and resets. Asset operations
-- (registering items, buildings, deciding requests) move to the new
-- PROPERTY_OFFICER account the seed adds. `STAFF` keeps its name and meaning.
--
-- Postgres cannot drop a value from an existing enum, so this is the standard
-- create/rename/retype dance. The `CASE` (rather than a bare
-- `"role"::text::"Role_new"`) is the part that matters: the cast would fail on
-- 'ADMIN' and abort the deploy. `ELSE` casts the rest through so an unexpected
-- value fails loudly instead of being silently nulled.

BEGIN;
CREATE TYPE "Role_new" AS ENUM ('SYSTEM_ADMIN', 'PROPERTY_OFFICER', 'DEPARTMENT_HEAD', 'STAFF', 'AUDITOR');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'SYSTEM_ADMIN'::"Role_new"
    ELSE "role"::text::"Role_new"
  END
);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;
