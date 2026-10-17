-- Add test requests with all possible statuses
-- USER_ID: a541e5b4-96a5-4fd8-98d7-034d7749e5a0 (CS Staff 1)
-- ITEM_ID: 50f19c36-bac3-4d67-8d5f-097e1810a7c2 (Dell Latitude Laptop)

-- PENDING
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "newLocationFloor", "newLocationRoom", "createdAt")
VALUES (gen_random_uuid(), 'TRANSFER', 'PENDING', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Pending transfer request', '2', '205', NOW());

-- PENDING_STAGE1
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "newLocationFloor", "newLocationRoom", "reviewedById", "stage1ApprovedById", "stage1ApprovedAt", "createdAt")
VALUES (gen_random_uuid(), 'TRANSFER', 'PENDING_STAGE1', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Stage 1 approved transfer', '2', '206', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', NOW(), NOW());

-- PENDING_STAGE2
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "newLocationFloor", "newLocationRoom", "reviewedById", "stage1ApprovedById", "stage1ApprovedAt", "stage2ApprovedById", "stage2ApprovedAt", "createdAt")
VALUES (gen_random_uuid(), 'TRANSFER', 'PENDING_STAGE2', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Stage 2 approved transfer', '2', '207', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', NOW(), 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', NOW(), NOW());

-- APPROVED
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "newLocationFloor", "newLocationRoom", "reviewedById", "stage1ApprovedById", "stage1ApprovedAt", "stage2ApprovedById", "stage2ApprovedAt", "createdAt")
VALUES (gen_random_uuid(), 'TRANSFER', 'APPROVED', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Approved transfer', '2', '208', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', NOW(), 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', NOW(), NOW());

-- REJECTED
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "newLocationFloor", "newLocationRoom", "reviewedById", "rejectionReason", "createdAt")
VALUES (gen_random_uuid(), 'TRANSFER', 'REJECTED', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Rejected transfer request', '2', '209', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Item is needed in current location', NOW());

-- WAITLISTED
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "newLocationFloor", "newLocationRoom", "createdAt")
VALUES (gen_random_uuid(), 'TRANSFER', 'WAITLISTED', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Waitlisted transfer', '2', '210', NOW());

-- WITHDRAWN
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "newLocationFloor", "newLocationRoom", "withdrawnAt", "withdrawnById", "createdAt")
VALUES (gen_random_uuid(), 'TRANSFER', 'WITHDRAWN', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Withdrawn by requester', '2', '211', NOW(), 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', NOW());

-- INVALIDATED
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "newLocationFloor", "newLocationRoom", "invalidatedAt", "invalidatedReason", "createdAt")
VALUES (gen_random_uuid(), 'TRANSFER', 'INVALIDATED', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Invalidated due to item status change', '2', '212', NOW(), 'Item status changed before decision', NOW());

-- RETURN_PENDING_CONFIRMATION
INSERT INTO "Request" (id, type, status, "itemId", "requestedById", reason, "loanReturnedAt", "createdAt")
VALUES (gen_random_uuid(), 'LOAN', 'RETURN_PENDING_CONFIRMATION', '50f19c36-bac3-4d67-8d5f-097e1810a7c2', 'a541e5b4-96a5-4fd8-98d7-034d7749e5a0', 'Loan return pending confirmation', NOW(), NOW());

-- Verify
SELECT status, COUNT(*) FROM "Request" GROUP BY status ORDER BY status;
