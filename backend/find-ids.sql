-- Find valid IDs to use in the test requests SQL

-- Get a valid user ID (use the first one returned)
SELECT id, email, "fullName" FROM "User" WHERE role = 'STAFF' LIMIT 5;

-- Get a valid item ID (use the first one returned)
SELECT id, tagId, name FROM "Item" LIMIT 5;
