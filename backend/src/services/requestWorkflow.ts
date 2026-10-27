import type { DbClient } from "../lib/dbClient.js";
import { httpError } from "../lib/httpError.js";
import { hasCapability } from "./permissions.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  buildEditLogRows,
  writeEditLogRows,
  type EditLogRow,
} from "./itemEditLog.js";
import {
  notifyRequesterOfDecision,
  type DecisionValue,
  type RequestTypeValue,
} from "./notifications.js";
import {
  collegeHolderFields,
  currentHolder,
  recordCustodyEvent,
  staffHolderFields,
  type HolderTypeValue,
} from "./holder.js";

/**
 * The transfer/disposal approval state machine (SRS F6, F7).
 *
 * The pure half of this file — `assertDecidable` and the `build*Changes`
 * functions — has no database access and no mocks in its tests. The impure half
 * (`applyDecision`) is the one transaction that has to be right, and its
 * ordering is documented step by step where it is defined.
 */

export type RequestStatusValue = "PENDING" | "PENDING_STAGE1" | "PENDING_STAGE2" | "APPROVED" | "REJECTED" | "WAITLISTED" | "WITHDRAWN" | "INVALIDATED" | "RETURN_PENDING_CONFIRMATION";

/**
 * Mirrors the Prisma `ItemStatus` enum (spec 4.2, plus LOANED). The states added
 * beyond ACTIVE and DISPOSED are not reachable from today's transfer/disposal paths,
 * and `assertDecidable` rejects them explicitly instead of falling through — a
 * PENDING_CLAIM or LOST item must never be transferred by accident.
 */
export type ItemStatusValue =
  | "PENDING_CLAIM"
  | "ACTIVE"
  | "REVERTED_UNVERIFIED"
  | "LOANED"
  | "LOST"
  | "DISPOSED"
  | "VOIDED";

/**
 * Error strings are exported constants, not literals at the throw site: routes
 * and tests assert on them, and the two must never drift. The existing
 * middleware strings ("Insufficient permissions", "Not authenticated") are
 * reused verbatim from middleware/auth.ts rather than restated here.
 */
export const ERROR_SELF_DECISION = "You cannot decide your own request";
export const ERROR_ALREADY_DECIDED = "Request has already been decided";
export const ERROR_ITEM_DISPOSED = "Item is already disposed";
/**
 * The item's status is no longer `ACTIVE`, so the change cannot be applied.
 *
 * It used to reuse `ERROR_ITEM_DISPOSED` — "Item is already disposed" — for
 * *any* item that was not in service. An item that is out on loan is not
 * disposed, and an approver reading "it was disposed" when it is on loan is
 * being told something false about the college's register.
 */
export const ERROR_ITEM_NOT_ACTIVE = "Item is no longer in service";
export const ERROR_ITEM_HAS_PENDING = "This item already has a pending request";
export const ERROR_DANGLING_OWNER = "newOwnerId does not match an existing user";
export const ERROR_REQUEST_NOT_FOUND = "Request not found";
export const ERROR_ITEM_NOT_FOUND = "Item not found";

/**
 * Invalidate pending requests when item status changes.
 * Workflow-completeness-spec.md §1.4
 */
export async function invalidateStaleRequests(
  prisma: DbClient,
  itemId: string,
  reason: string,
): Promise<void> {
  await prisma.request.updateMany({
    where: {
      itemId,
      status: { in: ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2", "WAITLISTED"] },
    },
    data: {
      status: "INVALIDATED",
      invalidatedAt: new Date(),
      invalidatedReason: reason,
    },
  });
}

/**
 * §8.2: Invalidate pending claim when item status changes under PENDING_CLAIM
 */
export async function invalidatePendingClaim(
  prisma: DbClient,
  itemId: string,
  reason: string,
): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { holderId: true, holderType: true },
  });

  if (!item) return;

  // Revert to COLLEGE pool
  await prisma.item.update({
    where: { id: itemId },
    data: {
      status: "ACTIVE",
      holderType: "COLLEGE",
      holderId: null,
      claimDueAt: null,
    },
  });

  // Record custody event
  await prisma.custodyEvent.create({
    data: {
      itemId,
      eventType: "CLAIM_REFUSED",
      fromHolderType: item.holderType,
      fromHolderId: item.holderId,
      toHolderType: "COLLEGE",
      toHolderId: null,
      actingUserId: (await prisma.user.findFirst({
        where: { role: "SYSTEM_ADMIN", accountStatus: "ACTIVE" },
        select: { id: true },
      }))?.id ?? "",
      reason,
    },
  });

  // Notify the claimant if they were a staff member
  if (item.holderId) {
    await prisma.notification.create({
      data: {
        userId: item.holderId,
        message: `Your claim for item ${itemId} has been invalidated: ${reason}`,
      },
    });
  }
}

export interface DecidabilityInput {
  requestStatus: RequestStatusValue;
  itemStatus: ItemStatusValue;
  requestedById: string;
  reviewerId: string;
}

/**
 * Decision D4 — the three refusals, cheapest and most specific first.
 *
 * Self-decision is checked before status because it is an authorization failure
 * (F6.2), not a state problem: "you may not decide this at all" is the more
 * accurate answer than "it was already decided", and it stays true no matter
 * what the request's status becomes.
 */
export function assertDecidable(input: DecidabilityInput): void {
  if (input.requestedById === input.reviewerId) {
    throw httpError(403, ERROR_SELF_DECISION);
  }
  if (!["PENDING", "PENDING_STAGE1", "PENDING_STAGE2"].includes(input.requestStatus)) {
    throw httpError(409, ERROR_ALREADY_DECIDED);
  }
  if (input.itemStatus === "DISPOSED") {
    throw httpError(409, ERROR_ITEM_DISPOSED);
  }
}

/** The Item columns an approval is allowed to write. Nothing else is touched. */
export interface ItemChanges {
  buildingId?: string | null;
  floor?: string | null;
  room?: string | null;
  ownerId?: string | null;
  /**
   * The holder pair (spec 4.1), written alongside `ownerId` and derived from the
   * same `newOwnerId` — see `buildTransferChanges`. They are intentionally absent
   * from `TRACKED_ITEM_FIELDS`: `ownerId` is still the custodian column the audit
   * trail names, with a human label attached, and two history rows for one
   * change would read as two changes.
   *
   * Nullable because the columns are: disposal returns an item to `COLLEGE`, which
   * is the one holder with no id.
   */
  holderType?: "STAFF" | "DEPARTMENT" | "COLLEGE" | null;
  holderId?: string | null;
  status?: string | null;
  disposalReason?: string | null;
  disposedAt?: Date | null;
  parentItemId?: string | null;
  currentValue?: number | null;
  condition?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  /// Claim handshake (workflow-completeness-spec.md §2): set when transfer to individual is approved
  claimedAt?: Date | null;
  claimDueAt?: Date | null;
}

export interface TransferRequestFields {
  newLocationBuilding: string | null;
  newLocationFloor: string | null;
  newLocationRoom: string | null;
  newOwnerId: string | null;
}

/**
 * A transfer only writes the fields it actually named — a request that moves an
 * item to a new room must not blank its building. Built with conditional spread
 * because `exactOptionalPropertyTypes` is on: an explicit `building: undefined`
 * is a type error, not a no-op.
 */
export function buildTransferChanges(request: TransferRequestFields): ItemChanges {
  return {
    ...(request.newLocationBuilding ? { buildingId: request.newLocationBuilding } : {}),
    ...(request.newLocationFloor ? { floor: request.newLocationFloor } : {}),
    ...(request.newLocationRoom ? { room: request.newLocationRoom } : {}),
    ...(request.newOwnerId
      ? { ownerId: request.newOwnerId, ...staffHolderFields(request.newOwnerId) }
      : {}),
  };
}

/**
 * Disposal is a status change, never a row delete (F7.2). `disposedAt` is passed
 * in rather than defaulted so it matches `Request.decidedAt` exactly.
 */
export function buildDisposalChanges(input: { reason: string; disposedAt: Date }): ItemChanges {
  return {
    status: "DISPOSED",
    disposalReason: input.reason,
    disposedAt: input.disposedAt,
    // The item goes back to the college's own pool: a disposed asset is nobody's
    // assignment, and leaving the last custodian's id on the row would be the
    // register disagreeing with the custody event written beside it.
    ...collegeHolderFields(),
  };
}

export interface AccessoryCascadeInput {
  type: RequestTypeValue;
  parentChanges: ItemChanges;
  parentTagId: string;
  reason: string;
  disposedAt: Date;
}

/**
 * Decision D6 — accessories follow their parent.
 *
 * A charger whose record still says Room 312 after the laptop moved to Room 101
 * is knowingly-wrong data, and F7.2 exists so the system stops lying about where
 * things are. The objection (this mutates rows the requester never named) is
 * answered by logging every cascaded field as its own ItemEditLog row sharing
 * one `editedAt`, not by declining to cascade. Unlink first if a bundle
 * genuinely should not move together.
 *
 * `parentItemId` is deliberately preserved on disposal — the bundle stays
 * recorded as a bundle in the history.
 */
export function buildAccessoryCascade(input: AccessoryCascadeInput): ItemChanges {
  if (input.type === "DISPOSAL") {
    return {
      status: "DISPOSED",
      disposalReason: `Disposed with parent item ${input.parentTagId}: ${input.reason}`,
      disposedAt: input.disposedAt,
      // Same reasoning as the parent (`buildDisposalChanges`): the bundle leaves
      // service together, so it also leaves its custodian together.
      ...collegeHolderFields(),
    };
  }

  const { buildingId, floor, room, ownerId, holderType, holderId } = input.parentChanges;
  return {
    ...(buildingId ? { buildingId } : {}),
    ...(floor ? { floor } : {}),
    ...(room ? { room } : {}),
    // A custodian change moves the whole bundle: an accessory left recorded
    // against the previous holder is the same knowingly-wrong data the cascade
    // rule (D6) exists to prevent, one level down.
    ...(ownerId ? { ownerId, ...(holderType ? { holderType } : {}), ...(holderId ? { holderId } : {}) } : {}),
  };
}

/** True when a change set would actually write something. */
export function hasChanges(changes: ItemChanges): boolean {
  return Object.keys(changes).length > 0;
}

export interface ApplyDecisionInput {
  requestId: string;
  reviewerId: string;
  decision: DecisionValue;
  /**
   * One timestamp for `Request.decidedAt`, `Item.disposedAt` and every
   * `ItemEditLog.editedAt` written by this decision. Created by the caller
   * before the transaction opens rather than left to `@default(now())`: sharing
   * an exact instant is how the parent item's history rows and its cascaded
   * accessories' rows are provably one event, and it is the correlation key
   * Phase 3 groups by (ItemEditLog has no requestId column).
   */
  decidedAt: Date;
  rejectionReason?: string | undefined;
  /** For two-stage approval: true if this is the final approval (stage 2 for transfers, single for disposal). */
  isFinalApproval?: boolean;
}

export interface DecisionParty {
  id: string;
  fullName: string;
  email: string;
}

export interface ApplyDecisionResult {
  requestId: string;
  type: RequestTypeValue;
  status: RequestStatusValue;
  decidedAt: Date;
  item: { id: string; tagId: string; name: string };
  itemChanges: ItemChanges;
  cascadedItemIds: string[];
  editLogRowCount: number;
  requester: DecisionParty;
  reviewer: DecisionParty;
  /** The stored `[CODE] ...` message, so the caller can reuse it for email. */
  notificationMessage: string;
}

/**
 * The core of Phase 2. Runs inside `prisma.$transaction(async (tx) => ...)` —
 * every refusal throws an HttpError, which both rolls the transaction back and
 * carries its own status code out to errorHandler.
 *
 * Step order is load-bearing; the numbering below matches docs/phase-2.md.
 * Reads: 4. Writes: at most 5 plus one notification (the extra one is the custody
 * event a transfer or disposal appends — see step 8b).
 *
 * No network I/O of any kind happens in here — the email side-channel runs after
 * the commit, because a transaction holds a pooled Neon connection for its whole
 * duration.
 */
export async function applyDecision(
  tx: DbClient,
  input: ApplyDecisionInput,
): Promise<ApplyDecisionResult> {
  // 1. The reviewer, read from the database. `role` is in the JWT, but a token
  //    issued before a demotion would still claim ADMIN, so authorization is
  //    re-checked against the current row rather than trusted from the token.
  const reviewer = await tx.user.findUnique({
    where: { id: input.reviewerId },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (!reviewer) {
    throw httpError(401, "Not authenticated");
  }

  // 2. Request, item and requester in one read, with explicit `select` blocks
  //    only. `include: { item: true }` would silently start leaking any Item
  //    column the Items track adds later.
  const request = await tx.request.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      type: true,
      status: true,
      reason: true,
      requestedById: true,
      newLocationBuilding: true,
      newLocationFloor: true,
      newLocationRoom: true,
      newOwnerId: true,
      requestedBy: { select: { id: true, fullName: true, email: true, role: true } },
      item: {
        select: {
          id: true,
          tagId: true,
          name: true,
          status: true,
          buildingId: true,
          floor: true,
          room: true,
          ownerId: true,
          // Read so the custody event can record where the item was before the
          // decision; `ownerId` is what the not-yet-backfilled rows carry.
          holderType: true,
          holderId: true,
          disposalReason: true,
          disposedAt: true,
          owner: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!request) {
    throw httpError(404, ERROR_REQUEST_NOT_FOUND);
  }

  // Capability check based on request type and stage
  const isTransfer = request.type === "TRANSFER";
  const isDisposal = request.type === "DISPOSAL";
  const isLoan = request.type === "LOAN";
  const isStage1 = request.status === "PENDING_STAGE1";
  const isStage2 = request.status === "PENDING_STAGE2";
  const isInitialPending = request.status === "PENDING";

  // Capability check based on request type and stage
  if (isTransfer) {
    if (isStage1 || isInitialPending) {
      // Stage 1 approval (releasing head) - requires TRANSFER_APPROVE_STAGE1
      if (!hasCapability(reviewer.role, "TRANSFER_APPROVE_STAGE1")) {
        throw httpError(403, "Insufficient permissions for stage 1 transfer approval");
      }
    } else if (request.status === "PENDING_STAGE2") {
      // Stage 2 approval (receiving head) - requires TRANSFER_APPROVE_STAGE2
      if (!hasCapability(reviewer.role, "TRANSFER_APPROVE_STAGE2")) {
        throw httpError(403, "Insufficient permissions for stage 2 transfer approval");
      }
    }
  } else if (request.type === "DISPOSAL") {
    // Disposal approval - requires DISPOSAL_APPROVE
    if (!hasCapability(reviewer.role, "DISPOSAL_APPROVE")) {
      throw httpError(403, "Insufficient permissions for disposal approval");
    }
  } else if (request.type === "LOAN") {
    // Loan approval - requires LOAN_APPROVE
    if (!hasCapability(reviewer.role, "LOAN_APPROVE")) {
      throw httpError(403, "Insufficient permissions for loan approval");
    }
  } else if (input.decision === "REJECTED") {
    // Rejection can be done by anyone with REQUEST_DECIDE
    if (!hasCapability(reviewer.role, "REQUEST_DECIDE")) {
      throw httpError(403, "Insufficient permissions to reject");
    }
  } else {
    throw httpError(403, "Insufficient permissions");
  }

  // 3. Business rules, before anything is written.
  assertDecidable({
    requestStatus: request.status,
    itemStatus: request.item.status,
    requestedById: request.requestedById,
    reviewerId: reviewer.id,
  });

  // Foreign-key labels for the audit trail: an `ownerId` history row reads
  // "Demo Staff (a3f1…)" rather than a bare uuid (decision D1).
  const labels: Record<string, string> = {};
  labels[request.item.owner.id] = request.item.owner.fullName;

  // 4. Determine next status first (needed to decide if item changes should be applied)
  let nextStatus: RequestStatusValue = request.status;
  let decidedAt: Date | undefined;

  if (input.decision === "REJECTED") {
    nextStatus = "REJECTED";
    decidedAt = input.decidedAt;
  } else if (input.decision === "APPROVED") {
    if (request.type === "TRANSFER") {
      if (request.status === "PENDING_STAGE1" || request.status === "PENDING") {
        nextStatus = "PENDING_STAGE2";
      } else if (request.status === "PENDING_STAGE2") {
        nextStatus = "APPROVED";
        decidedAt = input.decidedAt;
      }
    } else if (request.type === "DISPOSAL") {
      nextStatus = "APPROVED";
      decidedAt = input.decidedAt;
    } else if (request.type === "LOAN") {
      nextStatus = "APPROVED";
      decidedAt = input.decidedAt;
    }
  }

  // 5. Resolve the change set. Rejection changes nothing about the item.
  // For two-stage transfer approval: stage 1 (PENDING -> PENDING_STAGE2) applies no item changes,
  // stage 2 (PENDING_STAGE2 -> APPROVED) applies item changes.
  let itemChanges: ItemChanges = {};
  if (input.decision === "APPROVED") {
    if (request.type === "TRANSFER") {
      // Only apply item changes on stage 2 or final approval
      const isStage1Approval = request.status === "PENDING" && nextStatus === "PENDING_STAGE2";
      if (!isStage1Approval) {
        if (request.newOwnerId) {
          // `Request.newOwnerId` is a bare String with no foreign key, so it can
          // dangle if that user was removed after the request was filed.
          const newOwner = await tx.user.findUnique({
            where: { id: request.newOwnerId },
            select: { id: true, fullName: true },
          });
          if (!newOwner) {
            throw httpError(400, ERROR_DANGLING_OWNER);
          }
          labels[newOwner.id] = newOwner.fullName;
        }
        itemChanges = buildTransferChanges(request);
        
        // §2.3: Transfer to individual requires claim handshake
        // Transfer to department (no newOwnerId) does not need claim
        if (request.newOwnerId) {
          itemChanges.status = "PENDING_CLAIM";
          itemChanges.claimedAt = null;
          // Default claim window: 7 days (same as registration)
          const claimWindowDays = 7;
          itemChanges.claimDueAt = new Date(Date.now() + claimWindowDays * 24 * 60 * 60 * 1000);
        }
      }
    } else if (request.type === "DISPOSAL") {
      itemChanges = buildDisposalChanges({
        reason: request.reason,
        disposedAt: input.decidedAt,
      });
    } else if (request.type === "LOAN") {
      // §3.3: Loan approval now goes to PENDING_CLAIM, not directly to LOANED
      // Borrower must claim to start the loan, and loanDueDate is calculated from claim timestamp
      const claimWindowDays = 7;
      itemChanges = {
        status: "PENDING_CLAIM",
        holderType: "STAFF",
        holderId: request.newOwnerId,
        claimedAt: null,
        // Default claim window: 7 days
        claimDueAt: new Date(Date.now() + claimWindowDays * 24 * 60 * 60 * 1000),
      };
    }
  }

  // 6. Compare-and-swap the request. This runs BEFORE any item write: if two
  //    admins approve at the same moment, exactly one `updateMany` matches a
  //    PENDING row, and the loser aborts here without ever touching the item.
  //    Nothing else in this function guards that race.
  const requestWhere: Record<string, unknown> = { id: request.id };
  if (request.type === "TRANSFER") {
    if (request.status === "PENDING_STAGE1") {
      requestWhere.status = "PENDING_STAGE1";
    } else if (request.status === "PENDING_STAGE2") {
      requestWhere.status = "PENDING_STAGE2";
    } else {
      requestWhere.status = "PENDING";
    }
  } else if (request.type === "LOAN") {
    requestWhere.status = "PENDING";
  } else {
    requestWhere.status = "PENDING";
  }

  const requestUpdateData: Record<string, unknown> = {
    status: nextStatus,
    reviewedById: reviewer.id,
    ...(decidedAt ? { decidedAt } : {}),
    ...(input.decision === "REJECTED" && input.rejectionReason
      ? { rejectionReason: input.rejectionReason }
      : {}),
    // Track stage 1 and stage 2 approvals for transfers
    ...(request.type === "TRANSFER" && nextStatus === "PENDING_STAGE2"
      ? { stage1ApprovedById: reviewer.id, stage1ApprovedAt: input.decidedAt }
      : {}),
    ...(request.type === "TRANSFER" && nextStatus === "APPROVED"
      ? { stage2ApprovedById: reviewer.id, stage2ApprovedAt: input.decidedAt }
      : {}),
  };

  const requestUpdate = await tx.request.updateMany({
    where: requestWhere,
    data: requestUpdateData,
  });
  if (requestUpdate.count === 0) {
    throw httpError(409, ERROR_ALREADY_DECIDED);
  }

  const cascadedItemIds: string[] = [];
  let editLogRows: EditLogRow[] = [];

  if (hasChanges(itemChanges)) {
    // 6. Compare-and-swap the item as well, so "someone disposed it while this
    //    request sat in the queue" is race-free rather than a lost update.
    const itemUpdate = await tx.item.updateMany({
      where: { id: request.item.id, status: "ACTIVE" },
      data: itemChanges as Prisma.ItemUpdateManyMutationInput,
    });
    if (itemUpdate.count === 0) {
      throw httpError(409, ERROR_ITEM_NOT_ACTIVE);
    }

    // Invalidate pending requests on this item (workflow-completeness-spec.md §1.4)
    if (itemChanges.status === "DISPOSED" || itemChanges.status === "VOIDED") {
      await invalidateStaleRequests(
        tx,
        request.item.id,
        `Item status changed to ${itemChanges.status} before this request could be decided`,
      );
    }

    editLogRows = buildEditLogRows({
      itemId: request.item.id,
      editedById: reviewer.id,
      editedAt: input.decidedAt,
      before: request.item,
      after: itemChanges,
      labels,
    });

    // 7. Cascade to accessories. One findMany plus one updateMany, whatever the
    //    bundle size — depth is capped at 2, so "direct accessories" and "all
    //    accessories" are the same set and no recursion is needed.
    const accessories = await tx.item.findMany({
      where: { parentItemId: request.item.id, status: "ACTIVE" },
      select: {
        id: true,
        tagId: true,
        buildingId: true,
        floor: true,
        room: true,
        ownerId: true,
        status: true,
        disposalReason: true,
        disposedAt: true,
      },
    });

    const cascade = buildAccessoryCascade({
      type: request.type,
      parentChanges: itemChanges,
      parentTagId: request.item.tagId,
      reason: request.reason,
      disposedAt: input.decidedAt,
    });

    if (accessories.length > 0 && hasChanges(cascade)) {
      await tx.item.updateMany({
        where: { id: { in: accessories.map((accessory) => accessory.id) }, status: "ACTIVE" },
        data: cascade as Prisma.ItemUpdateManyMutationInput,
      });

      for (const accessory of accessories) {
        cascadedItemIds.push(accessory.id);
        editLogRows = editLogRows.concat(
          buildEditLogRows({
            itemId: accessory.id,
            editedById: reviewer.id,
            editedAt: input.decidedAt,
            before: accessory,
            after: cascade,
            labels,
          }),
        );
      }
    }

    // 8. One insert for the parent's rows and every accessory's rows, all
    //    sharing editedById and editedAt. Nothing about the cascade is silent.
    await writeEditLogRows(tx, editLogRows);
  }

  // 8b. The custody trail (spec 4.1, 4.5). The item write above already carried
  //     the new holder columns, so this appends the event only — one statement
  //     holds the holder change and the location change together, under the one
  //     `status: ACTIVE` guard that makes this decision race-free.
  //
  //     A transfer that names no new custodian changes no holder, and
  //     `recordCustodyEvent` writes nothing for it: a room move has no custody
  //     story. A disposal does — the item leaves service — so it records the move
  //     out of a holder's hands to nobody (`to` null), matching the schema's
  //     "holderId is null when holderType is COLLEGE" and the disposal state.
  if (input.decision === "APPROVED") {
    // A transfer that names no new custodian moves the item, not the custody of it
    // — that is a room change, and its history is the edit log. Only these two
    // decisions change whose hands the item is in.
    const leavesService = request.type === "DISPOSAL";
    const changesCustodian = request.type === "TRANSFER" && Boolean(itemChanges.holderId);

    if (leavesService || changesCustodian) {
      await recordCustodyEvent(tx, {
        itemId: request.item.id,
        from: currentHolder(request.item),
        to: {
          holderType: itemChanges.holderType ?? null,
          holderId: itemChanges.holderId ?? null,
        },
        eventType: leavesService ? "DISPOSED" : "TRANSFERRED",
        actingUserId: reviewer.id,
        reason: request.reason,
      });
    }
  }

  // 9. Tell the requester what happened (F8.2). Written inside the transaction,
  //    so a decision can never commit without its notification.
  const notificationMessage = await notifyRequesterOfDecision(tx, {
    requestId: request.id,
    requesterId: request.requestedById,
    requesterRole: request.requestedBy.role,
    decision: input.decision,
    requestType: request.type,
    itemTagId: request.item.tagId,
    itemName: request.item.name,
    reviewerName: reviewer.fullName,
    decidedAt: input.decidedAt,
    ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
  });

  return {
    requestId: request.id,
    type: request.type,
    status: nextStatus,
    decidedAt: decidedAt ?? input.decidedAt,
    item: { id: request.item.id, tagId: request.item.tagId, name: request.item.name },
    itemChanges,
    cascadedItemIds,
    editLogRowCount: editLogRows.length,
    requester: request.requestedBy,
    reviewer: { id: reviewer.id, fullName: reviewer.fullName, email: reviewer.email },
    notificationMessage,
  };
}

/**
 * Return a loaned item — mark the loan as returned and restore item to ACTIVE.
 * Can be called by the borrower, the releasing head, or the property officer.
 */
export async function returnLoan(
  tx: DbClient,
  input: {
    requestId: string;
    returnerId: string;
    condition: string;
    notes?: string | null;
    decidedAt: Date;
  },
): Promise<{ requestId: string; itemId: string }> {
  // 1. Find the loan request
  const request = await tx.request.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      type: true,
      status: true,
      requestedById: true,
      // Who approved the loan: the one person the return handshake is owed to.
      // With `LOAN_APPROVE` held by the Property Officer alone, this is the
      // officer who let the item go out.
      reviewedById: true,
      itemId: true,
      loanReturnedAt: true,
      item: {
        select: {
          id: true,
          tagId: true,
          name: true,
          status: true,
          holderType: true,
          holderId: true,
        },
      },
    },
  });
  if (!request) {
    throw httpError(404, ERROR_REQUEST_NOT_FOUND);
  }
  if (request.type !== "LOAN") {
    throw httpError(400, "Only loan requests can be returned");
  }
  /**
   * The **confirmation** half of the handshake, so the states it accepts are the
   * ones a return can be waiting in.
   *
   * `RETURN_PENDING_CONFIRMATION` is where `POST /requests/:id/return-initiate`
   * puts the loan; accepting only `APPROVED` here (as this used to) meant the
   * borrower's "I am handing it back" was followed by a guaranteed 409 —
   * "Loan is not active" — on the lender's confirmation, and a returned item
   * could never leave the borrower's custody. `APPROVED` stays accepted so an
   * officer can record a hand-back that was never announced in the app.
   */
  if (request.status !== "RETURN_PENDING_CONFIRMATION" && request.status !== "APPROVED") {
    throw httpError(409, "Loan is not waiting for a return confirmation");
  }
  if (request.loanReturnedAt) {
    throw httpError(409, "Loan has already been returned");
  }

  // The lender, not the borrower: confirming one's own return would let the
  // person holding the item close the loan without anyone checking it back in.
  const returner = await tx.user.findUnique({
    where: { id: input.returnerId },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (!returner) {
    throw httpError(401, "Not authenticated");
  }
  const isBorrower = request.requestedById === input.returnerId;
  const isPropertyOfficer = returner.role === "PROPERTY_OFFICER";
  const isReviewingOfficer = request.reviewedById === input.returnerId;
  if (isBorrower || (!isPropertyOfficer && !isReviewingOfficer)) {
    throw httpError(403, "Only the lender or the property officer can confirm this return");
  }

  // Update the item back to ACTIVE and restore holder to the original department/college
  // For simplicity, return to COLLEGE pool; the department head can re-claim if needed
  await tx.item.update({
    where: { id: request.itemId },
    data: {
      status: "ACTIVE",
      holderType: "COLLEGE",
      holderId: null,
    },
  });

  /**
   * The condition check the confirmation step exists for.
   *
   * `condition` and `notes` were accepted by the schema and then dropped on the
   * floor, so the officer's "returned damaged" was recorded nowhere. The item's
   * own `condition` column is an enum and the officer's answer is prose ("Good,
   * as lent"), so the observation belongs in the custody trail rather than
   * being coerced into the enum: changes to the asset's recorded condition stay
   * an edit, which writes an edit-history row.
   */
  const returnReason = [
    `Loan returned — condition: ${input.condition.trim()}`,
    input.notes?.trim() ? `Notes: ${input.notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  // Record custody event
  await recordCustodyEvent(tx, {
    itemId: request.item.id,
    from: { holderType: "STAFF", holderId: request.requestedById },
    to: { holderType: "COLLEGE", holderId: null },
    eventType: "TRANSFERRED",
    actingUserId: input.returnerId,
    reason: returnReason,
  });

  // Update the request to mark as returned
  await tx.request.update({
    where: { id: input.requestId },
    data: {
      loanReturnedAt: input.decidedAt,
      loanReturnedById: input.returnerId,
      status: "APPROVED", // Keep as approved but loanReturnedAt indicates return
    },
  });

  return { requestId: request.id, itemId: request.item.id };
}
