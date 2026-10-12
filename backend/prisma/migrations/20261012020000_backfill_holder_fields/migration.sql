-- Backfill the holder columns on rows written before they existed (spec 4.1).
--
-- `holderType`/`holderId` arrived in the Phase A expand migration, but nothing
-- wrote them until `services/holder.ts`: every row created before that has a
-- custodian in `ownerId` and `holderType` NULL. Those rows are why
-- `currentHolder()` still falls back to `ownerId`, and why the contract step (which
-- drops `Item.ownerId`) cannot land yet — dropping the column would erase the only
-- record of who holds those items.
--
-- What the mapping is, and why it is the honest one: a row with a custodian is a
-- person's assignment, which is `STAFF` — the same reading the expand migration
-- documented for the role slice. Nothing is inferred about departments or the
-- college pool: an item with no `ownerId` is left alone rather than guessed at,
-- and a row that already has a holder (written by the new code) is never touched.
--
-- Idempotent by construction: the `WHERE` matches nothing on a second run, so
-- re-executing it — or running it against a database that already has holders —
-- is a no-op rather than a rewrite of history.
--
-- No schema change: this is data only, and it is the expansion half of the
-- expand → contract pair whose contract is dropping `ownerId` and the free-text
-- `department`.

UPDATE "Item"
SET "holderType" = 'STAFF',
    "holderId" = "ownerId"
WHERE "holderType" IS NULL
  AND "ownerId" IS NOT NULL;
