import type { DbClient } from "../lib/dbClient.js";
import { httpError } from "../lib/httpError.js";
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

/**
 * The transfer/disposal approval state machine (SRS F6, F7).
 *
 * The pure half of this file — `assertDecidable` and the `build*Changes`
 * functions — has no database access and no mocks in its tests. The impure half
 * (`applyDecision`) is the one transaction that has to be right, and its
 * ordering is documented step by step where it is defined.
 */

export type RequestStatusValue = "PENDING" | "APPROVED" | "REJECTED";
export type ItemStatusValue = "ACTIVE" | "DISPOSED";

/**
 * Error strings are exported constants, not literals at the throw site: routes
 * and tests assert on them, and the two must never drift. The existing
 * middleware strings ("Insufficient permissions", "Not authenticated") are
 * reused verbatim from middleware/auth.ts rather than restated here.
 */
export const ERROR_SELF_DECISION = "You cannot decide your own request";
export const ERROR_ALREADY_DECIDED = "Request has already been decided";
export const ERROR_ITEM_DISPOSED = "Item is already disposed";
export const ERROR_ITEM_HAS_PENDING = "This item already has a pending request";
export const ERROR_DANGLING_OWNER = "newOwnerId does not match an existing user";
export const ERROR_REQUEST_NOT_FOUND = "Request not found";
export const ERROR_ITEM_NOT_FOUND = "Item not found";

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
  if (input.requestStatus !== "PENDING") {
    throw httpError(409, ERROR_ALREADY_DECIDED);
  }
  if (input.itemStatus === "DISPOSED") {
    throw httpError(409, ERROR_ITEM_DISPOSED);
  }
}

/** The Item columns an approval is allowed to write. Nothing else is touched. */
export interface ItemChanges {
  building?: string;
  floor?: string;
  room?: string;
  ownerId?: string;
  status?: ItemStatusValue;
  disposalReason?: string;
  disposedAt?: Date;
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
    ...(request.newLocationBuilding ? { building: request.newLocationBuilding } : {}),
    ...(request.newLocationFloor ? { floor: request.newLocationFloor } : {}),
    ...(request.newLocationRoom ? { room: request.newLocationRoom } : {}),
    ...(request.newOwnerId ? { ownerId: request.newOwnerId } : {}),
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
    };
  }

  const { building, floor, room, ownerId } = input.parentChanges;
  return {
    ...(building ? { building } : {}),
    ...(floor ? { floor } : {}),
    ...(room ? { room } : {}),
    ...(ownerId ? { ownerId } : {}),
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
}

export interface DecisionParty {
  id: string;
  fullName: string;
  email: string;
}

export interface ApplyDecisionResult {
  requestId: string;
  type: RequestTypeValue;
  status: DecisionValue;
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
 * Reads: 4. Writes: at most 4 plus one notification.
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
  if (reviewer.role !== "ADMIN") {
    throw httpError(403, "Insufficient permissions");
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
      requestedBy: { select: { id: true, fullName: true, email: true } },
      item: {
        select: {
          id: true,
          tagId: true,
          name: true,
          status: true,
          building: true,
          floor: true,
          room: true,
          ownerId: true,
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

  // 4. Resolve the change set. Rejection changes nothing about the item.
  let itemChanges: ItemChanges = {};
  if (input.decision === "APPROVED") {
    if (request.type === "TRANSFER") {
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
    } else {
      itemChanges = buildDisposalChanges({
        reason: request.reason,
        disposedAt: input.decidedAt,
      });
    }
  }

  // 5. Compare-and-swap the request. This runs BEFORE any item write: if two
  //    admins approve at the same moment, exactly one `updateMany` matches a
  //    PENDING row, and the loser aborts here without ever touching the item.
  //    Nothing else in this function guards that race.
  const requestUpdate = await tx.request.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: {
      status: input.decision,
      reviewedById: reviewer.id,
      decidedAt: input.decidedAt,
      ...(input.decision === "REJECTED" && input.rejectionReason
        ? { rejectionReason: input.rejectionReason }
        : {}),
    },
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
      data: itemChanges,
    });
    if (itemUpdate.count === 0) {
      throw httpError(409, ERROR_ITEM_DISPOSED);
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
        building: true,
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
        data: cascade,
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

  // 9. Tell the requester what happened (F8.2). Written inside the transaction,
  //    so a decision can never commit without its notification.
  const notificationMessage = await notifyRequesterOfDecision(tx, {
    requestId: request.id,
    requesterId: request.requestedById,
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
    status: input.decision,
    decidedAt: input.decidedAt,
    item: { id: request.item.id, tagId: request.item.tagId, name: request.item.name },
    itemChanges,
    cascadedItemIds,
    editLogRowCount: editLogRows.length,
    requester: request.requestedBy,
    reviewer: { id: reviewer.id, fullName: reviewer.fullName, email: reviewer.email },
    notificationMessage,
  };
}
