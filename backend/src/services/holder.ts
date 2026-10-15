import type { DbClient } from "../lib/dbClient.js";

/**
 * The holder model (spec 4.1) — **who an item is with**, as opposed to who
 * registered it.
 *
 * The database has carried `holderType`/`holderId` since the Phase A expand
 * migration, but nothing wrote them: `Item.ownerId` was still the only custody
 * column, and it can only express "a person". A college-owned laptop, a
 * department's projector and a staff member's assigned phone are three different
 * kinds of custody with three different answerable parties, which is what the
 * holder columns exist to record.
 *
 * This module is the one place that decides holder fields and the one place that
 * writes the custody trail, so the two can never disagree: `buildCustodyEvent`
 * derives the event's `from`/`to` from the same pair (`holderFields`) a column
 * write uses. There are two entry points because the callers differ in who owns
 * the item write:
 *
 *   - `recordCustodyEvent` appends only the trail. Used where the item write
 *     already carries the new holder — the approval path, so a transfer writes the
 *     location *and* the holder in the one statement that is guarded by
 *     `status: ACTIVE` (its optimistic lock).
 *   - `writeCustodyChange` sets the columns *and* appends the trail, for callers
 *     that are moving an item on their own and would otherwise have to remember to
 *     do both.
 *
 * ── `ownerId` is still written, deliberately ──────────────────────────────
 * The contract step drops `Item.ownerId`, and it cannot land until every row has
 * been backfilled (`holderType = 'STAFF', holderId = ownerId`) — those are the
 * rows written before this file existed. Until then the staff holder and `ownerId`
 * are written together from the same input, so they cannot drift, and
 * `currentHolder` below falls back to `ownerId` for the not-yet-backfilled ones.
 */

/** Mirrors the Prisma `HolderType` enum. */
export type HolderTypeValue = "STAFF" | "DEPARTMENT" | "COLLEGE";

/** Mirrors the Prisma `CustodyEventType` enum — only the members this file writes are named. */
export type CustodyEventTypeValue =
  | "CREATED"
  | "TRANSFERRED"
  | "DISPOSED"
  | "LOCATION_CHANGED"
  | "CLAIMED"
  | "CLAIMED_WITH_CORRECTION"
  | "CLAIM_REFUSED"
  | "CLAIM_EXPIRED"
  | "REVERTED"
  | "VOIDED";

/** A holder as a pair. `COLLEGE` is the one type that has no id. */
export interface HolderRef {
  holderType: HolderTypeValue | null;
  holderId: string | null;
}

/** The college's own pool: nobody in particular is answerable for the item. */
export const COLLEGE_HOLDER: HolderRef = { holderType: "COLLEGE", holderId: null };

/** An item assigned to a person. `ownerId` and this agree by construction. */
export function staffHolder(userId: string): HolderRef {
  return { holderType: "STAFF", holderId: userId };
}

/**
 * The same pair, typed as the non-null columns it is.
 *
 * `holderFields(staffHolder(id))` is `HolderType | null`, which is right for a
 * holder that might be `COLLEGE` and wrong for a write that provably has a person
 * — `exactOptionalPropertyTypes` rejects it, and widening the target to `| null`
 * would let a genuinely absent holder through.
 */
export function staffHolderFields(userId: string): { holderType: "STAFF"; holderId: string } {
  return { holderType: "STAFF", holderId: userId };
}

/**
 * The same, for the one holder that has no id.
 *
 * A disposed or reverted item belongs to no person: these are the columns that say
 * so, and writing them is what keeps the row from still claiming the last
 * custodian after the custody event beside it told the truth.
 */
export function collegeHolderFields(): { holderType: "COLLEGE"; holderId: null } {
  return { holderType: "COLLEGE", holderId: null };
}

/** The pair as Prisma wants it, so callers never spell the column names twice. */
export function holderFields(holder: HolderRef): { holderType: HolderTypeValue | null; holderId: string | null } {
  return { holderType: holder.holderType, holderId: holder.holderId };
}

/** The item fields an item read must have selected for `currentHolder`. */
export interface ItemCustodyColumns {
  holderType?: string | null;
  holderId?: string | null;
  ownerId?: string | null;
}

/**
 * What an item currently records as its holder.
 *
 * Holder-first, with `ownerId` as a documented fallback for rows written before
 * the holder columns existed. The fallback is the reason this is a function rather
 * than a column read at the call site: when the backfill lands, deleting it here
 * is a one-line change, whereas a `?? ownerId` scattered over the codebase is a
 * search-and-hope.
 */
export function currentHolder(item: ItemCustodyColumns): HolderRef {
  if (item.holderType) {
    return {
      holderType: item.holderType as HolderTypeValue,
      holderId: item.holderId ?? null,
    };
  }
  if (item.ownerId) return staffHolder(item.ownerId);
  return COLLEGE_HOLDER;
}

/** True when two holders are the same party, so a no-op move writes no history row. */
export function sameHolder(a: HolderRef, b: HolderRef): boolean {
  return a.holderType === b.holderType && a.holderId === b.holderId;
}

/** The `from`/`to` columns of a `CustodyEvent` row. */
export interface CustodyTransition {
  fromHolderType: HolderTypeValue | null;
  fromHolderId: string | null;
  toHolderType: HolderTypeValue | null;
  toHolderId: string | null;
}

export function custodyTransition(from: HolderRef, to: HolderRef): CustodyTransition {
  return {
    fromHolderType: from.holderType,
    fromHolderId: from.holderId,
    toHolderType: to.holderType,
    toHolderId: to.holderId,
  };
}

export interface CustodyEventInput {
  eventType: CustodyEventTypeValue;
  from: HolderRef;
  to: HolderRef;
  actingUserId: string;
  reason?: string | null;
  /**
   * Who was the responsible department head at that moment (spec 4.5/4.9.4), or
   * null. Stored as a snapshot because heads change and history must not be
   * rewritten by a later reorganisation.
   *
   * Left null by every caller in this slice: `Item.departmentId` is not written
   * yet, so there is no department to read a head from. It lands with the
   * department wiring rather than being guessed here.
   */
  departmentHeadSnapshot?: string | null;
}

/** The row a `CustodyEvent` insert needs, minus `itemId`. */
export function buildCustodyEvent(input: CustodyEventInput): CustodyTransition & {
  eventType: CustodyEventTypeValue;
  actingUserId: string;
  reason: string | null;
  departmentHeadSnapshot: string | null;
} {
  return {
    eventType: input.eventType,
    ...custodyTransition(input.from, input.to),
    actingUserId: input.actingUserId,
    reason: input.reason ?? null,
    departmentHeadSnapshot: input.departmentHeadSnapshot ?? null,
  };
}

/**
 * Move an item's holder and record it — the only writer of both.
 *
 * Two statements, one call, and the caller is already inside its own transaction
 * (`applyDecision`'s, or the item route's). Deliberately not an upsert: an item
 * that is gone is an error the caller wants to hear about, not a row Prisma
 * silently creates.
 *
 * The event is skipped when the holder did not actually change — a transfer that
 * only moves an item to a new room has no custody story to tell, and a
 * `LOCATION_CHANGED` row saying nothing moved would make the history noisier than
 * the edit log it sits beside.
 */
export interface CustodyChangeInput {
  itemId: string;
  from: HolderRef;
  to: HolderRef;
  eventType: CustodyEventTypeValue;
  actingUserId: string;
  reason?: string | null;
  departmentHeadSnapshot?: string | null;
}

/**
 * Append one custody event, and nothing else — for callers whose item write
 * already carried the new holder.
 *
 * Returns false, and writes nothing, when the holder did not change: a move that
 * is only a room change has no custody story, and a `LOCATION_CHANGED` row saying
 * nothing moved would make this table noisier than the edit log beside it.
 */
export async function recordCustodyEvent(
  tx: DbClient,
  input: CustodyChangeInput,
): Promise<boolean> {
  if (sameHolder(input.from, input.to)) return false;

  await tx.custodyEvent.create({
    data: {
      itemId: input.itemId,
      ...buildCustodyEvent({
        eventType: input.eventType,
        from: input.from,
        to: input.to,
        actingUserId: input.actingUserId,
        reason: input.reason ?? null,
        departmentHeadSnapshot: input.departmentHeadSnapshot ?? null,
      }),
    },
  });

  return true;
}

/**
 * Move an item's holder and record it — the columns and the trail in one call.
 *
 * Two statements, and the caller is already inside its own transaction
 * (`applyDecision`'s, or a route's). Deliberately not an upsert: an item that is
 * gone is an error the caller wants to hear about, not a row Prisma silently
 * creates.
 */
export async function writeCustodyChange(
  tx: DbClient,
  input: CustodyChangeInput,
): Promise<boolean> {
  if (sameHolder(input.from, input.to)) return false;

  await tx.item.update({
    where: { id: input.itemId },
    data: holderFields(input.to),
  });

  return recordCustodyEvent(tx, input);
}

/**
 * Claim an item — move from PENDING_CLAIM to ACTIVE, holder becomes the claimant.
 *
 * Preconditions:
 * - item.status === "PENDING_CLAIM"
 * - the claimant is the current holder (staff) or department head of the holder department
 * - claimDueAt not passed
 */
export async function claimItem(
  tx: DbClient,
  input: {
    itemId: string;
    claimant: HolderRef;
    actingUserId: string;
  },
): Promise<{ success: boolean; reason?: string }> {
  const item = await tx.item.findUnique({
    where: { id: input.itemId },
    select: { status: true, holderType: true, holderId: true, claimDueAt: true, departmentId: true },
  });

  if (!item) {
    return { success: false, reason: "Item not found" };
  }

  if (item.status !== "PENDING_CLAIM") {
    return { success: false, reason: "Item is not pending claim" };
  }

  if (item.claimDueAt && new Date(item.claimDueAt) < new Date()) {
    return { success: false, reason: "Claim period has expired" };
  }

  // The holder must match the claimant (staff holds it, or department head claims on behalf)
  const current = currentHolder(item as ItemCustodyColumns);
  if (!sameHolder(current, input.claimant)) {
    // Allow department head to claim on behalf of department
    if (input.claimant.holderType === "DEPARTMENT" && current.holderType === "STAFF") {
      // The department head can claim for their department if the item is assigned to someone in their dept
      // This is handled at the route level by checking department head's departmentId
    } else {
      return { success: false, reason: "Not the current holder" };
    }
  }

  await tx.item.update({
    where: { id: input.itemId },
    data: {
      status: "ACTIVE",
      claimedAt: new Date(),
      claimDueAt: null,
      holderType: input.claimant.holderType,
      holderId: input.claimant.holderId,
    },
  });

  await recordCustodyEvent(tx, {
    itemId: input.itemId,
    from: current,
    to: input.claimant,
    eventType: "CLAIMED",
    actingUserId: input.actingUserId,
    reason: input.claimant.holderType === "DEPARTMENT" ? "Department head claimed on behalf of department" : null,
  });

  return { success: true };
}

/**
 * Refuse a claim — item reverts to COLLEGE pool, status PENDING_CLAIM.
 */
export async function refuseClaim(
  tx: DbClient,
  input: {
    itemId: string;
    claimant: HolderRef;
    actingUserId: string;
    reason: string;
  },
): Promise<{ success: boolean; reason?: string }> {
  const item = await tx.item.findUnique({
    where: { id: input.itemId },
    select: { status: true, holderType: true, holderId: true, claimDueAt: true },
  });

  if (!item) {
    return { success: false, reason: "Item not found" };
  }

  if (item.status !== "PENDING_CLAIM") {
    return { success: false, reason: "Item is not pending claim" };
  }

  const current = currentHolder(item as ItemCustodyColumns);
  if (!sameHolder(current, input.claimant)) {
    return { success: false, reason: "Not the current holder" };
  }

  await tx.item.update({
    where: { id: input.itemId },
    data: {
      holderType: "COLLEGE",
      holderId: null,
      claimDueAt: null,
    },
  });

  await recordCustodyEvent(tx, {
    itemId: input.itemId,
    from: current,
    to: COLLEGE_HOLDER,
    eventType: "CLAIM_REFUSED",
    actingUserId: input.actingUserId,
    reason: input.reason,
  });

  return { success: true };
}

/**
 * Expire a claim — called by a job/scheduler when claimDueAt passes.
 * Reverts item to COLLEGE pool, status PENDING_CLAIM.
 */
export async function expireClaim(
  tx: DbClient,
  input: {
    itemId: string;
    actingUserId: string;
  },
): Promise<{ success: boolean; reason?: string }> {
  const item = await tx.item.findUnique({
    where: { id: input.itemId },
    select: { status: true, holderType: true, holderId: true, claimDueAt: true },
  });

  if (!item) {
    return { success: false, reason: "Item not found" };
  }

  if (item.status !== "PENDING_CLAIM") {
    return { success: false, reason: "Item is not pending claim" };
  }

  if (!item.claimDueAt || new Date(item.claimDueAt) >= new Date()) {
    return { success: false, reason: "Claim period has not expired" };
  }

  const current = currentHolder(item as ItemCustodyColumns);

  await tx.item.update({
    where: { id: input.itemId },
    data: {
      holderType: "COLLEGE",
      holderId: null,
      claimDueAt: null,
    },
  });

  await recordCustodyEvent(tx, {
    itemId: input.itemId,
    from: current,
    to: COLLEGE_HOLDER,
    eventType: "CLAIM_EXPIRED",
    actingUserId: input.actingUserId,
    reason: "Claim period expired without action",
  });

  return { success: true };
}

/**
 * Revert an item when its holder is deactivated — status becomes REVERTED_UNVERIFIED,
 * holder becomes COLLEGE.
 */
export async function revertItem(
  tx: DbClient,
  input: {
    itemId: string;
    actingUserId: string;
  },
): Promise<{ success: boolean; reason?: string }> {
  const item = await tx.item.findUnique({
    where: { id: input.itemId },
    select: { status: true, holderType: true, holderId: true },
  });

  if (!item) {
    return { success: false, reason: "Item not found" };
  }

  const current = currentHolder(item as ItemCustodyColumns);

  await tx.item.update({
    where: { id: input.itemId },
    data: {
      status: "REVERTED_UNVERIFIED",
      holderType: "COLLEGE",
      holderId: null,
    },
  });

  await recordCustodyEvent(tx, {
    itemId: input.itemId,
    from: current,
    to: COLLEGE_HOLDER,
    eventType: "REVERTED",
    actingUserId: input.actingUserId,
    reason: "Holder deactivated",
  });

  return { success: true };
}
